"""Loading / Unloading Tracking — config and live counts API."""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from apps.api.deps import get_config, get_tenant_repo
from apps.api.routers.stream import _BOUNDARY, _TAIL, _error_frame
from apps.api.schemas.common import MessageResult
from apps.api.schemas.loading import LoadingConfigIn, LoadingConfigOut, LoadingCountsOut
from apps.api.security import decode_access_token
from apps.core.config import AppConfig
from apps.core.repository import TenantRepository

router = APIRouter(prefix="/loading", tags=["loading"])


# ── helpers ────────────────────────────────────────────────────────────────


def _row_to_out(cfg) -> LoadingConfigOut:
    return LoadingConfigOut(
        enabled=cfg.enabled,
        source=cfg.source,
        presets=json.loads(cfg.presets or "[]"),
        customs=json.loads(cfg.customs or "[]"),
        camera_ids=json.loads(cfg.camera_ids or "[]"),
        camera_classes=json.loads(cfg.camera_classes or "{}"),
        running_camera_ids=json.loads(cfg.running_camera_ids or "[]"),
        updated_at=cfg.updated_at,
    )


def _default_out() -> LoadingConfigOut:
    return LoadingConfigOut(
        enabled=False, source="preset", presets=[], customs=[],
        camera_ids=[], camera_classes={},
        running_camera_ids=[], updated_at=None,
    )


def _counts_file(data_dir: Path, tenant_id: str, camera_id: int) -> Path:
    return data_dir / "loading_counts" / f"{tenant_id}_{camera_id}.json"


def _read_counts(path: Path, camera_id: int) -> LoadingCountsOut:
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            # Migrate legacy files that stored only a single "counts" dict.
            if "loaded_count" not in data and "counts" in data:
                data["loaded_count"] = data.get("counts") or {}
            return LoadingCountsOut(**data)
        except Exception:
            pass
    return LoadingCountsOut(
        loaded_count={},
        visible_now={},
        last_event=None,
        camera_id=camera_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


# ── routes ─────────────────────────────────────────────────────────────────


@router.get("/config", response_model=LoadingConfigOut)
def get_loading_config(repo: TenantRepository = Depends(get_tenant_repo)):
    cfg = repo.get_loading_config()
    return _row_to_out(cfg) if cfg else _default_out()


@router.put("/config", response_model=LoadingConfigOut)
def save_loading_config(
    body: LoadingConfigIn,
    repo: TenantRepository = Depends(get_tenant_repo),
):
    cfg = repo.upsert_loading_config(
        enabled=body.enabled,
        source=body.source,
        presets=body.presets,
        customs=body.customs,
        camera_ids=body.camera_ids,
        camera_classes=body.camera_classes,
    )
    return _row_to_out(cfg)


@router.get("/counts/{camera_id}", response_model=LoadingCountsOut)
def get_camera_counts(
    camera_id: int,
    app_config: AppConfig = Depends(get_config),
    repo: TenantRepository = Depends(get_tenant_repo),
):
    """Return the latest object counts for a specific camera."""
    path = _counts_file(app_config.data_dir, repo.tenant_id, camera_id)
    return _read_counts(path, camera_id)


@router.get("/counts", response_model=dict[int, LoadingCountsOut])
def get_all_counts(
    app_config: AppConfig = Depends(get_config),
    repo: TenantRepository = Depends(get_tenant_repo),
):
    """Return latest counts for all cameras assigned to loading tracking."""
    cfg = repo.get_loading_config()
    if not cfg:
        return {}
    camera_ids: list[int] = json.loads(cfg.camera_ids or "[]")
    return {
        cam_id: _read_counts(
            _counts_file(app_config.data_dir, repo.tenant_id, cam_id), cam_id
        )
        for cam_id in camera_ids
    }


# ── per-camera start / stop / reset ──────────────────────────────────────────


@router.post("/cameras/{camera_id}/start", response_model=LoadingConfigOut)
def start_camera(
    camera_id: int,
    repo: TenantRepository = Depends(get_tenant_repo),
):
    """Start cumulative counting for one camera (must be assigned + feature enabled)."""
    cfg = repo.set_loading_camera_running(camera_id, True)
    if cfg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No loading config")
    return _row_to_out(cfg)


@router.post("/cameras/{camera_id}/stop", response_model=LoadingConfigOut)
def stop_camera(
    camera_id: int,
    repo: TenantRepository = Depends(get_tenant_repo),
):
    """Stop counting for one camera. The cumulative total is preserved."""
    cfg = repo.set_loading_camera_running(camera_id, False)
    if cfg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No loading config")
    return _row_to_out(cfg)


@router.post("/cameras/{camera_id}/reset", response_model=MessageResult)
def reset_camera(
    camera_id: int,
    request: Request,
    app_config: AppConfig = Depends(get_config),
    repo: TenantRepository = Depends(get_tenant_repo),
):
    """Zero a camera's cumulative count (works whether running or stopped)."""
    manager = getattr(request.app.state, "loading_manager", None)
    if manager is not None:
        manager.reset_camera(repo.tenant_id, camera_id)
    else:
        # Fallback: zero the counts file directly if the manager isn't up.
        path = _counts_file(app_config.data_dir, repo.tenant_id, camera_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({
            "loaded_count": {}, "visible_now": {}, "last_event": None,
            "camera_id": camera_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "mode": "exit_visibility_loss",
        }), encoding="utf-8")
    return MessageResult(message="Counts reset")


# ── live annotated MJPEG feed ────────────────────────────────────────────────


@router.get("/cameras/{camera_id}/stream")
def stream_camera(
    camera_id: int,
    request: Request,
    token: str = Query(...),
    app_config: AppConfig = Depends(get_config),
):
    """Live MJPEG feed with YOLO-World tracking boxes for one loading camera.

    Token is passed as a query param so it can be used directly as an <img> src.
    Frames come from the running worker thread (no second inference); the feed
    shows a placeholder while the camera is starting or stopped.
    """
    try:
        payload = decode_access_token(app_config.auth, token)
        tenant_id: str = payload["tenant_id"]
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    manager = getattr(request.app.state, "loading_manager", None)

    def _gen():
        frame_gap = 1.0 / 10  # ~10 fps to the browser
        while True:
            jpeg = None
            if manager is not None:
                jpeg = manager.request_stream_frame(tenant_id, camera_id)
            if jpeg is None:
                chunk = _BOUNDARY + _error_frame("Connecting…") + _TAIL
            else:
                chunk = _BOUNDARY + jpeg + _TAIL
            try:
                yield chunk
            except (GeneratorExit, ConnectionResetError, BrokenPipeError):
                break
            time.sleep(frame_gap)

    return StreamingResponse(
        _gen(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
