"""Event querying, details, snapshots, and CSV export — all tenant-scoped."""

from __future__ import annotations

import csv
import io
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, StreamingResponse

from apps.api.deps import get_config, get_tenant_repo
from apps.api.schemas import EventOut
from apps.core.config import AppConfig
from apps.core.repository import TenantRepository

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventOut])
def list_events(
    label: str | None = Query(None, description="case-insensitive substring match"),
    event_type: str | None = None,
    feature_type: str | None = None,
    camera_id: int | None = None,
    person_id: int | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = Query(100, ge=1, le=1000),
    repo: TenantRepository = Depends(get_tenant_repo),
):
    return repo.search_events(
        label=label,
        event_type=event_type,
        feature_type=feature_type,
        camera_id=camera_id,
        person_id=person_id,
        since=since,
        until=until,
        limit=limit,
    )


@router.get("/export.csv")
def export_events_csv(
    label: str | None = None,
    event_type: str | None = None,
    feature_type: str | None = None,
    camera_id: int | None = None,
    person_id: int | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = Query(10000, ge=1, le=100000),
    repo: TenantRepository = Depends(get_tenant_repo),
):
    """Export the (filtered) event history as CSV."""
    rows = repo.search_events(
        label=label,
        event_type=event_type,
        feature_type=feature_type,
        camera_id=camera_id,
        person_id=person_id,
        since=since,
        until=until,
        limit=limit,
    )

    def generate():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "id",
            "ts",
            "event_type",
            "feature_type",
            "label",
            "object_label",
            "score",
            "camera_id",
            "person_id",
            "has_snapshot",
        ])
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)
        for e in rows:
            writer.writerow([
                e.id,
                e.ts.isoformat() if e.ts else "",
                e.event_type,
                e.feature_type,
                e.label,
                e.object_label or "",
                f"{e.score:.4f}",
                e.camera_id if e.camera_id is not None else "",
                e.person_id if e.person_id is not None else "",
                "yes" if e.snapshot_path else "no",
            ])
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=events.csv"},
    )


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: int, repo: TenantRepository = Depends(get_tenant_repo)):
    event = repo.get_event(event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _snapshot_file(config: AppConfig, tenant_id: str, snapshot_path: str | None) -> Path:
    if not snapshot_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")

    candidate = (config.data_dir / snapshot_path).resolve()
    tenant_snapshot_root = (config.data_dir / "snapshots" / tenant_id).resolve()
    try:
        candidate.relative_to(tenant_snapshot_root)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    if not candidate.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    return candidate


@router.get("/{event_id}/snapshot")
def get_event_snapshot(
    event_id: int,
    repo: TenantRepository = Depends(get_tenant_repo),
    config: AppConfig = Depends(get_config),
):
    event = repo.get_event(event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    path = _snapshot_file(config, repo.tenant_id, event.snapshot_path)
    return FileResponse(path, media_type="image/jpeg")
