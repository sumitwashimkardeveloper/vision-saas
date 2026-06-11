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

logger = logging.getLogger("camera_worker")


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
        ppe_detector: PPEDetector | None = None,
        enabled_ppe_keys: set[str] | None = None,
    ):
        super().__init__(name=f"{tenant_id}:{camera_name}", daemon=True)
        self.config = config
        self.tenant_id = tenant_id
        self.rtsp_url = rtsp_url
        self.camera_id = camera_id
        self.camera_name = camera_name
        self.gallery = gallery
        self.event_sink = event_sink
        self.ppe_detector = ppe_detector
        self.enabled_ppe_keys: set[str] = enabled_ppe_keys or set()
        # One detector per worker: FaceDetectorYN is stateful (input size),
        # sharing across threads would race.
        self.detector = detector or FaceDetector(config.recognition)
        self._stop_evt = threading.Event()

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

                for face in self.detector.detect(frame):
                    result = match(self.gallery, face.embedding, rec.match_threshold)
                    if not result.is_match and not rec.log_unknowns:
                        continue
                    snapshot_path = save_snapshot(
                        self.config, self.tenant_id, frame, result.name
                    )
                    event = MatchEvent(
                        tenant_id=self.tenant_id,
                        label=result.name,
                        score=result.score,
                        camera_id=self.camera_id,
                        person_key=result.key,
                        snapshot_path=snapshot_path,
                    )
                    if self.event_sink is not None:
                        # Fix 7: non-blocking hand-off to EventBatcher
                        self.event_sink(event)
                    else:
                        with session_scope(self.config) as session:
                            persist_event(session, event)

                # PPE detection — runs only when a model is configured and at
                # least one feature is enabled for this tenant.
                if self.ppe_detector and self.enabled_ppe_keys:
                    try:
                        for det in self.ppe_detector.detect(frame, self.enabled_ppe_keys):
                            snapshot_path = save_snapshot(
                                self.config, self.tenant_id, frame, f"ppe_{det.feature_key}"
                            )
                            ppe_event = MatchEvent(
                                tenant_id=self.tenant_id,
                                label=f"PPE:{det.label}",
                                score=det.confidence,
                                camera_id=self.camera_id,
                                person_key=None,
                                snapshot_path=snapshot_path,
                                event_type="ppe_detection",
                            )
                            if self.event_sink is not None:
                                self.event_sink(ppe_event)
                            else:
                                with session_scope(self.config) as session:
                                    persist_event(session, ppe_event)
                    except Exception:
                        logger.exception(
                            "[%s] PPE detection error on '%s'", self.tenant_id, self.camera_name
                        )

        except Exception:  # noqa: BLE001 — never let one camera kill the supervisor
            logger.exception("[%s] camera '%s' crashed", self.tenant_id, self.camera_name)
        finally:
            logger.info("[%s] worker for '%s' stopped", self.tenant_id, self.camera_name)
