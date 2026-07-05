"""CameraWorker: the recognition loop for a single camera, runnable as a thread.

Fix 4 — Shared FrameBuffer: CameraWorker now reads frames from
         apps.core.frame_buffer.get_buffer() instead of opening its own
         RTSPStream connection. When Path A (worker) and Path B (live stream)
         run in the same process they share one RTSP connection per camera.
         In subprocess deployments each process has its own FrameBuffer
         instance but the code is structured for future in-process sharing.

Fix 7 — EventBatcher: the supervisor always passes event_sink=batcher.add so
         all CameraWorker threads funnel DB writes through a single writer
         thread, eliminating per-event SQLite lock contention (ADR-002).
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Callable

import numpy as np

from apps.core.config import AppConfig
from apps.core.db import session_scope
from apps.core.detector import FaceDetector
from apps.core.frame_buffer import get_buffer   # Fix 4: shared FrameBuffer
from apps.core.pipeline import MatchEvent, persist_event, save_snapshot
from apps.core.ppe_detector import PPEDetector
from apps.core.recognizer import Gallery, match
from apps.core.repository import TenantRepository

logger = logging.getLogger("camera_worker")

# How often (seconds) the worker re-reads enabled PPE features from the DB.
# Toggles in the UI take effect within this window without a worker restart.
_FEATURES_REFRESH_INTERVAL = 30.0


class CameraWorker(threading.Thread):
    def __init__(
        self,
        config: AppConfig,
        tenant_id: str,
        rtsp_url: str,
        camera_id: int | None,
        camera_name: str,
        gallery: Gallery,
        detector: FaceDetector | None = None,
        event_sink: Callable[[MatchEvent], None] | None = None,
    ):
        super().__init__(name=f"{tenant_id}:{camera_name}", daemon=True)
        self.config = config
        self.tenant_id = tenant_id
        self.rtsp_url = rtsp_url
        self.camera_id = camera_id
        self.camera_name = camera_name
        self.gallery = gallery
        self.event_sink = event_sink
        # One detector per worker: FaceDetectorYN is stateful (input size),
        # sharing across threads would race.
        self.detector = detector or FaceDetector(config.recognition)
        self.ppe_detector: PPEDetector | None = (
            PPEDetector(config.ppe) if config.ppe.enabled else None
        )
        # Cache of currently enabled PPE feature keys, refreshed every 30 s.
        self._enabled_ppe_keys: set[str] = set()
        # Whether face recognition is toggled on for this tenant (refreshed too).
        self._face_recognition_enabled: bool = False
        self._features_loaded_at: float = 0.0

        self._stop_evt = threading.Event()

    # ---- PPE feature cache ------------------------------------------------

    def _refresh_features_if_needed(self) -> None:
        """Re-read enabled PPE features from DB if the TTL has expired."""
        now = time.monotonic()
        if now - self._features_loaded_at < _FEATURES_REFRESH_INTERVAL:
            return
        try:
            from apps.core.ppe_registry import FACE_RECOGNITION_KEY, PPE_FEATURES_BY_KEY
            with session_scope(self.config) as session:
                repo = TenantRepository(session, self.tenant_id)
                # Per-camera: only features assigned to THIS camera are active.
                raw = repo.get_enabled_features_for_camera(self.camera_id)
            # Only keep keys that exist in the current registry.
            self._enabled_ppe_keys = {k for k in raw if k in PPE_FEATURES_BY_KEY}
            self._face_recognition_enabled = FACE_RECOGNITION_KEY in raw
            self._features_loaded_at = now
        except Exception:
            logger.exception("[%s] failed to refresh features from DB", self.tenant_id)

    # ---- PPE violation check ---------------------------------------------

    def _check_ppe(self, frame: np.ndarray) -> None:
        """Run PPE detection for enabled features; emit events for missing gear."""
        self._refresh_features_if_needed()
        if not self._enabled_ppe_keys:
            return  # nothing toggled on — skip inference entirely

        try:
            detections = self.ppe_detector.detect(frame, self._enabled_ppe_keys)
        except FileNotFoundError as exc:
            logger.warning("[%s] PPE model unavailable: %s", self.tenant_id, exc)
            self.ppe_detector = None  # disable to avoid repeated log spam
            return

        detected_keys = {d.feature_key for d in detections}
        missing = self._enabled_ppe_keys - detected_keys
        if not missing:
            return

        # Save one snapshot shared across all violation events for this frame.
        snapshot_path = save_snapshot(
            self.config,
            self.tenant_id,
            frame,
            "ppe_violation",
            camera_id=self.camera_id,
        )

        for key in missing:
            event = MatchEvent(
                tenant_id=self.tenant_id,
                label=f"ppe_violation:{key}",
                score=1.0,
                event_type="ppe_violation",
                feature_type=key,
                camera_id=self.camera_id,
                snapshot_path=snapshot_path,
                details={"missing_feature": key},
            )
            if self.event_sink is not None:
                self.event_sink(event)
            else:
                with session_scope(self.config) as session:
                    persist_event(session, event)

        logger.info(
            "[%s] PPE violation on camera %s — missing: %s",
            self.tenant_id,
            self.camera_id,
            ", ".join(sorted(missing)),
        )

    def stop(self) -> None:
        self._stop_evt.set()

    def run(self) -> None:
        rec = self.config.recognition
        cfg = self.config.stream
        logger.info("[%s] starting recognition on '%s'", self.tenant_id, self.camera_name)

        # Fix 4: use the shared FrameBuffer so this worker and the live-stream
        # router share one RTSP connection when running in the same process.
        buf = get_buffer(self.rtsp_url)

        # Separate reader thread keeps the FrameBuffer polled at target_fps
        # while the detection loop runs at whatever speed inference allows.
        min_interval = 1.0 / cfg.target_fps if cfg.target_fps > 0 else 0.0

        _latest: list[np.ndarray | None] = [None]
        _slot_lock = threading.Lock()
        _new_frame = threading.Event()
        _reader_done = threading.Event()

        def _reader() -> None:
            last_emit = 0.0
            while not self._stop_evt.is_set():
                now = time.monotonic()
                if now - last_emit < min_interval:
                    time.sleep(0.005)
                    continue
                frame = buf.get()
                if frame is None:
                    # Stream stalled or not yet connected — back off briefly.
                    time.sleep(0.1)
                    continue
                last_emit = now
                with _slot_lock:
                    _latest[0] = frame
                _new_frame.set()
            _reader_done.set()
            _new_frame.set()  # wake detection loop so it exits cleanly

        reader = threading.Thread(
            target=_reader, daemon=True, name=f"{self.name}-reader"
        )
        reader.start()

        try:
            while not _reader_done.is_set():
                _new_frame.wait(timeout=1.0)
                _new_frame.clear()
                with _slot_lock:
                    frame = _latest[0]
                if frame is None:
                    continue

                # Refresh toggle state up front so we can skip work that's off.
                self._refresh_features_if_needed()
                run_ppe = self.ppe_detector is not None and bool(self._enabled_ppe_keys)

                # Face detection is needed for recognition AND as person-presence
                # for PPE. Skip it entirely only when both are off.
                faces = []
                if self._face_recognition_enabled or run_ppe:
                    faces = self.detector.detect(frame)

                # Identity matching + recognition events only when the feature is on.
                if self._face_recognition_enabled:
                    for face in faces:
                        result = match(self.gallery, face.embedding, rec.match_threshold)
                        snapshot_path = save_snapshot(
                            self.config,
                            self.tenant_id,
                            frame,
                            result.name,
                            camera_id=self.camera_id,
                        )
                        event = MatchEvent(
                            tenant_id=self.tenant_id,
                            label=result.name,
                            score=result.score,
                            event_type="face_recognition" if result.is_match else "unknown_face",
                            feature_type="face_recognition",
                            camera_id=self.camera_id,
                            person_key=result.key,
                            snapshot_path=snapshot_path,
                            details={
                                "face_detection_score": face.det_score,
                                "matched": result.is_match,
                            },
                        )
                        if self.event_sink is not None:
                            self.event_sink(event)
                        else:
                            with session_scope(self.config) as session:
                                persist_event(session, event)

                # PPE check: only when at least one person is in the frame.
                if faces and run_ppe:
                    self._check_ppe(frame)


        except Exception:  # noqa: BLE001 — never let one camera kill the supervisor
            logger.exception("[%s] camera '%s' crashed", self.tenant_id, self.camera_name)
        finally:
            logger.info("[%s] worker for '%s' stopped", self.tenant_id, self.camera_name)
