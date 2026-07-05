"""LoadingWorkerManager — auto-manages YOLO-World tracking threads.

Runs as a daemon inside the FastAPI process. Every few seconds it reads the
DB loading config and starts / stops one LoadingCameraThread per camera that
is both assigned AND started (running) for the enabled feature.

Counting rule (visibility-loss): the whole camera view is the exit/truck zone.
Each visible object gets a temporary ByteTrack ID. When that ID stops being
visible for ``missing_frame_threshold`` consecutive frames, the object is
counted +1 — exactly once per ID. This avoids counting the same visible object
every frame and avoids counting on a single missed-detection frame.

The dashboard shows two values per object label:
  - visible_now  : objects currently tracked in the latest frame (not cumulative)
  - loaded_count : objects that disappeared after being tracked  (cumulative)

loaded_count persists across Stop/Start; the Reset action zeroes it.

Start:   add a camera, then press Start on it in the UI.
Stop:    press Stop, remove the camera, or disable the feature.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime, timezone

import cv2

from apps.core.config import AppConfig
from apps.core.db import session_scope
from apps.core.frame_buffer import get_buffer
from apps.core.loading_detector import LoadingDetection, LoadingDetector, resolve_class_names
from apps.core.pipeline import save_snapshot
from apps.core.repository import TenantRepository

logger = logging.getLogger("loading_worker")

_MANAGER_POLL = 5.0   # seconds between DB config checks
_COUNTS_WRITE = 1.0   # seconds between writing cumulative counts to disk
_STREAM_WIDTH = 854   # output width for the live "View" feed (height proportional)
_STREAM_HOLD  = 5.0   # keep rendering the live feed this long after the last viewer poll


def _counts_path(config: AppConfig, tenant_id: str, camera_id: int):
    out_dir = config.data_dir / "loading_counts"
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / f"{tenant_id}_{camera_id}.json"


_MODE = "exit_visibility_loss"


def _write_counts_file(config: AppConfig, tenant_id: str, camera_id: int,
                       loaded_count: dict, visible_now: dict,
                       last_event: dict | None) -> None:
    payload = {
        "loaded_count": loaded_count,
        "visible_now":  visible_now,
        "last_event":   last_event,
        "camera_id":    camera_id,
        "timestamp":    datetime.now(timezone.utc).isoformat(),
        "mode":         _MODE,
    }
    _counts_path(config, tenant_id, camera_id).write_text(
        json.dumps(payload), encoding="utf-8"
    )


def _read_loaded_count(config: AppConfig, tenant_id: str, camera_id: int) -> dict[str, int]:
    """Resume the cumulative loaded_count from disk (legacy 'counts' supported)."""
    path = _counts_path(config, tenant_id, camera_id)
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            counts = data.get("loaded_count", data.get("counts", {})) or {}
            return {k: int(v) for k, v in counts.items()}
        except Exception:
            pass
    return {}


# ── Per-camera tracking thread ────────────────────────────────────────────────

class LoadingCameraThread(threading.Thread):
    """Reads frames, tracks objects, counts each one once when it disappears.

    Owns its OWN LoadingDetector instance because ByteTrack keeps per-stream
    state inside the model — sharing one model across cameras would mix tracks.
    """

    def __init__(
        self,
        config: AppConfig,
        tenant_id: str,
        camera_id: int,
        rtsp_url: str,
    ) -> None:
        super().__init__(name=f"loading:{tenant_id}:{camera_id}", daemon=True)
        self.config    = config
        self.tenant_id = tenant_id
        self.camera_id = camera_id
        self.rtsp_url  = rtsp_url
        self._detector = LoadingDetector(
            model_path=config.loading.model_path,
            conf_threshold=config.loading.conf_threshold,
            iou_threshold=config.loading.iou_threshold,
            device=config.loading.device,
            tracker=str(config.loading.tracker_path),
        )
        # Frames a track ID must be missing before it counts as "loaded".
        self._missing_threshold = max(1, int(config.loading.missing_frame_threshold))
        # Frames a track must have been visible before it is eligible to count.
        self._min_visible = max(1, int(config.loading.min_visible_frames))

        self._class_names: list[str] = []
        self._lock      = threading.Lock()
        self._stop      = threading.Event()
        self._reset_evt = threading.Event()

        # Cumulative: resume the loaded total from disk.
        self._loaded_count: dict[str, int] = _read_loaded_count(config, tenant_id, camera_id)
        # Live: objects visible in the latest processed frame (not cumulative).
        self._visible_now:  dict[str, int] = {}
        # Per-track memory: track_id -> {"label", "missing", "counted"}.
        self._tracks:       dict[int, dict] = {}
        self._last_event:   dict | None = None

        # Live "View" feed: the worker only annotates + encodes a JPEG while a
        # viewer is actively polling, so idle cameras pay no extra cost.
        self._frame_lock   = threading.Lock()
        self._latest_jpeg: bytes | None = None
        self._viewer_until: float = 0.0

    def update_config(self, class_names: list[str]) -> None:
        with self._lock:
            self._class_names = list(class_names)

    def request_reset(self) -> None:
        self._reset_evt.set()

    def request_stream(self) -> None:
        """Mark that a viewer wants the live feed; keeps rendering for a few s."""
        self._viewer_until = time.monotonic() + _STREAM_HOLD

    def get_jpeg(self) -> bytes | None:
        with self._frame_lock:
            return self._latest_jpeg

    def stop(self) -> None:
        self._stop.set()

    def _do_reset(self) -> None:
        self._loaded_count = {}
        self._visible_now = {}
        self._tracks = {}
        self._last_event = None
        _write_counts_file(self.config, self.tenant_id, self.camera_id, {}, {}, None)
        logger.info("[%s] reset counts → camera %s", self.tenant_id, self.camera_id)

    def _record_loading_event(self, label: str, track_id: int, total: int, frame, score: float) -> None:
        snapshot_path = save_snapshot(
            self.config,
            self.tenant_id,
            frame,
            f"loading_{label}",
            camera_id=self.camera_id,
        )
        with session_scope(self.config) as session:
            repo = TenantRepository(session, self.tenant_id)
            repo.add_event(
                label=f"loaded:{label}",
                score=score,
                camera_id=self.camera_id,
                snapshot_path=snapshot_path,
                event_type="loading_count",
                feature_type="loading_unloading",
                object_label=label,
                details={
                    "track_id": track_id,
                    "loaded_count": total,
                    "mode": _MODE,
                },
            )

    def _process(self, detections, frame) -> None:
        """Update track memory + counts from one frame's detections."""
        active_ids: set[int] = set()
        visible: dict[str, int] = {}

        for det in detections:
            visible[det.label] = visible.get(det.label, 0) + 1
            if det.track_id is None:
                continue  # visible but not yet tracked → can't be counted
            active_ids.add(det.track_id)
            mem = self._tracks.get(det.track_id)
            if mem is None:
                self._tracks[det.track_id] = {
                    "label": det.label,
                    "confidence": det.confidence,
                    "seen": 1,
                    "missing": 0,
                    "counted": False,
                }
            else:
                mem["seen"] += 1
                mem["missing"] = 0
                mem["label"] = det.label  # keep the most recent label
                mem["confidence"] = det.confidence

        # Track IDs not seen this frame: age them; count once past threshold.
        for track_id, mem in list(self._tracks.items()):
            if track_id in active_ids:
                continue
            mem["missing"] += 1

            # A track that was never visible long enough is detection flicker /
            # a phantom ID — discard it without counting.
            if not mem["counted"] and mem["seen"] < self._min_visible:
                if mem["missing"] >= self._missing_threshold:
                    del self._tracks[track_id]
                continue

            if not mem["counted"] and mem["missing"] >= self._missing_threshold:
                label = mem["label"]
                self._loaded_count[label] = self._loaded_count.get(label, 0) + 1
                mem["counted"] = True
                try:
                    self._record_loading_event(
                        label,
                        track_id,
                        self._loaded_count[label],
                        frame,
                        float(mem.get("confidence", 1.0)),
                    )
                except Exception:
                    logger.exception(
                        "[%s] failed to record loading event on camera %s",
                        self.tenant_id,
                        self.camera_id,
                    )
                self._last_event = {
                    "label": label,
                    "track_id": track_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                logger.debug("[%s] camera %s loaded %s (id=%s) → total %s",
                             self.tenant_id, self.camera_id, label, track_id,
                             self._loaded_count[label])
            # Prune long-gone IDs so memory stays bounded.
            if mem["counted"] and mem["missing"] >= self._missing_threshold * 5:
                del self._tracks[track_id]

        self._visible_now = visible

    def _render_stream_frame(self, frame, detections: list[LoadingDetection]) -> None:
        """Draw tracking boxes + IDs on the frame and cache it as a JPEG.

        Only called while a viewer is actively polling the live feed.
        """
        h, w = frame.shape[:2]
        if w > _STREAM_WIDTH:
            scale = _STREAM_WIDTH / w
            img = cv2.resize(frame, (_STREAM_WIDTH, int(h * scale)))
        else:
            scale = 1.0
            img = frame.copy()

        for det in detections:
            x1, y1, x2, y2 = (int(v * scale) for v in det.bbox)
            cv2.rectangle(img, (x1, y1), (x2, y2), (80, 200, 0), 2)
            tag = det.label if det.track_id is None else f"{det.label} #{det.track_id}"
            (tw, th), _ = cv2.getTextSize(tag, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(img, (x1, y1 - th - 8), (x1 + tw + 6, y1), (80, 200, 0), cv2.FILLED)
            cv2.putText(img, tag, (x1 + 3, y1 - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)

        # Top-left banner with live + cumulative totals.
        visible = sum(self._visible_now.values())
        loaded = sum(self._loaded_count.values())
        banner = f"Visible: {visible}   Loaded: {loaded}"
        cv2.rectangle(img, (0, 0), (max(220, len(banner) * 11), 30), (0, 0, 0), cv2.FILLED)
        cv2.putText(img, banner, (8, 21),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)

        ok, jpeg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])
        if ok:
            with self._frame_lock:
                self._latest_jpeg = jpeg.tobytes()

    def run(self) -> None:
        logger.info("[%s] loading tracking started → camera %s", self.tenant_id, self.camera_id)
        buf        = get_buffer(self.rtsp_url)
        last_write = 0.0

        while not self._stop.is_set():
            if self._reset_evt.is_set():
                self._reset_evt.clear()
                self._do_reset()

            frame = buf.get()
            if frame is None:
                time.sleep(0.1)
                continue

            with self._lock:
                class_names = list(self._class_names)

            if not class_names:
                time.sleep(0.5)
                continue

            try:
                detections = self._detector.track(frame, class_names)
            except ImportError as exc:
                logger.error("[%s] YOLO-World unavailable: %s", self.tenant_id, exc)
                break
            except Exception:
                logger.exception("[%s] tracking error on camera %s", self.tenant_id, self.camera_id)
                time.sleep(1.0)
                continue

            self._process(detections, frame)

            # Render the annotated live feed only while someone is watching.
            if time.monotonic() < self._viewer_until:
                try:
                    self._render_stream_frame(frame, detections)
                except Exception:
                    logger.exception("[%s] stream render error on camera %s",
                                     self.tenant_id, self.camera_id)

            now = time.monotonic()
            if now - last_write >= _COUNTS_WRITE:
                _write_counts_file(
                    self.config, self.tenant_id, self.camera_id,
                    dict(self._loaded_count), dict(self._visible_now), self._last_event,
                )
                last_write = now

        # Final flush: nothing is visible once stopped, but keep the cumulative.
        _write_counts_file(
            self.config, self.tenant_id, self.camera_id,
            dict(self._loaded_count), {}, self._last_event,
        )
        logger.info("[%s] loading tracking stopped → camera %s", self.tenant_id, self.camera_id)


# ── Manager ───────────────────────────────────────────────────────────────────

class LoadingWorkerManager(threading.Thread):
    """Daemon thread inside the FastAPI process.

    Polls the DB every few seconds and starts/stops LoadingCameraThreads to
    match the cameras that are assigned AND started (running) for the enabled
    loading feature.
    """

    def __init__(self, config: AppConfig) -> None:
        super().__init__(name="loading-manager", daemon=True)
        self.config = config
        self._stop = threading.Event()
        # (tenant_id, camera_id) → running thread
        self._threads: dict[tuple[str, int], LoadingCameraThread] = {}

    def stop(self) -> None:
        self._stop.set()
        for t in list(self._threads.values()):
            t.stop()

    def reset_camera(self, tenant_id: str, camera_id: int) -> None:
        """Zero a camera's cumulative count, whether or not it's running."""
        key = (tenant_id, camera_id)
        t = self._threads.get(key)
        if t is not None:
            t.request_reset()
        else:
            _write_counts_file(self.config, tenant_id, camera_id, {}, {}, None)

    def request_stream_frame(self, tenant_id: str, camera_id: int) -> bytes | None:
        """Ask the camera's worker for a fresh annotated JPEG of the live feed.

        Returns None when the camera isn't currently running (no worker thread).
        """
        t = self._threads.get((tenant_id, camera_id))
        if t is None:
            return None
        t.request_stream()
        return t.get_jpeg()

    def run(self) -> None:
        logger.info("Loading worker manager started (polls every %.0fs)", _MANAGER_POLL)
        while not self._stop.is_set():
            try:
                self._sync()
            except Exception:
                logger.exception("LoadingWorkerManager sync error")
            self._stop.wait(timeout=_MANAGER_POLL)
        logger.info("Loading worker manager stopped")

    # ── internal ──────────────────────────────────────────────────────────────

    def _desired_state(self) -> dict[tuple[str, int], dict]:
        """Return {(tenant_id, camera_id): info} for cameras that should be tracking."""
        desired: dict[tuple[str, int], dict] = {}
        try:
            from sqlalchemy import select
            from apps.core.models import Tenant
            from apps.core.repository import TenantRepository

            with session_scope(self.config) as session:
                tenants = session.scalars(select(Tenant)).all()

                for tenant in tenants:
                    repo = TenantRepository(session, tenant.id)
                    cfg  = repo.get_loading_config()
                    if not cfg or not cfg.enabled:
                        continue

                    assigned = json.loads(cfg.camera_ids or "[]")
                    running  = json.loads(cfg.running_camera_ids or "[]")
                    # Only cameras that are assigned AND started should track.
                    active = [c for c in running if c in assigned]
                    if not active:
                        continue

                    global_classes = resolve_class_names(
                        cfg.source or "preset",
                        json.loads(cfg.presets or "[]"),
                        json.loads(cfg.customs or "[]"),
                    )
                    per_cam_classes: dict[str, list[str]] = json.loads(cfg.camera_classes or "{}")

                    for cam_id in active:
                        cam = repo.get_camera(cam_id)
                        if not (cam and cam.rtsp_url):
                            continue
                        class_names = per_cam_classes.get(str(cam_id)) or global_classes
                        if not class_names:
                            continue
                        desired[(tenant.id, cam_id)] = {
                            "rtsp_url":    cam.rtsp_url,
                            "class_names": class_names,
                        }
        except Exception:
            logger.exception("Failed to read desired loading state from DB")
        return desired

    def _sync(self) -> None:
        desired = self._desired_state()

        # Stop threads no longer needed.
        for key in list(self._threads):
            if key not in desired:
                self._threads[key].stop()
                del self._threads[key]
                logger.info("Stopped loading tracking  tenant=%s camera=%s", *key)

        # Start new threads / hot-reload class names on existing ones.
        for (tid, cid), info in desired.items():
            if (tid, cid) in self._threads:
                self._threads[(tid, cid)].update_config(info["class_names"])
            else:
                if not self.config.loading.model_path.exists():
                    logger.error(
                        "YOLO-World model missing at %s — run: python scripts/download_models.py",
                        self.config.loading.model_path,
                    )
                    continue
                t = LoadingCameraThread(
                    config=self.config,
                    tenant_id=tid,
                    camera_id=cid,
                    rtsp_url=info["rtsp_url"],
                )
                t.update_config(info["class_names"])
                t.start()
                self._threads[(tid, cid)] = t
                logger.info("Started  loading tracking  tenant=%s camera=%s classes=%s",
                            tid, cid, info["class_names"])
