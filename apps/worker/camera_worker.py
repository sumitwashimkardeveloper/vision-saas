"""CameraWorker: the recognition loop for a single camera, runnable as a thread.

Phase 1 ran this loop inline for one camera. Phase 2 reuses it both for the
standalone single-camera worker and for the multi-tenant supervisor, which runs
one CameraWorker per enabled camera. Each worker owns its own RTSP connection
and detector; the tenant gallery is shared read-only across a tenant's cameras.

Phase 4 will replace this thread-based model with a process pool plus frame
sampling/backpressure and watchdogs.
"""

from __future__ import annotations

import logging
import threading
from typing import Callable

from apps.core.config import AppConfig
from apps.core.db import session_scope
from apps.core.detector import FaceDetector
from apps.core.pipeline import MatchEvent, persist_event, save_snapshot
from apps.core.recognizer import Gallery, match
from apps.core.stream import RTSPStream

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
    ):
        super().__init__(name=f"{tenant_id}:{camera_name}", daemon=True)
        self.config = config
        self.tenant_id = tenant_id
        self.camera_id = camera_id
        self.camera_name = camera_name
        self.gallery = gallery
        # If set, events are handed to the sink (e.g. EventBatcher) instead of
        # being written directly; otherwise each event is written immediately.
        self.event_sink = event_sink
        # One detector per worker: cv2.FaceDetectorYN is stateful (input size),
        # so sharing across threads would race. Memory cost is revisited in Phase 4.
        self.detector = detector or FaceDetector(config.recognition)
        self.stream = RTSPStream(rtsp_url, config.stream, name=f"{tenant_id}:{camera_name}")

    def stop(self) -> None:
        self.stream.stop()

    def run(self) -> None:
        rec = self.config.recognition
        logger.info("[%s] starting recognition on '%s'", self.tenant_id, self.camera_name)
        try:
            for frame in self.stream.frames():
                for face in self.detector.detect(frame):
                    result = match(self.gallery, face.embedding, rec.match_threshold)
                    if not result.is_match and not rec.log_unknowns:
                        continue
                    snapshot_path = save_snapshot(self.config, self.tenant_id, frame, result.name)
                    event = MatchEvent(
                        tenant_id=self.tenant_id,
                        label=result.name,
                        score=result.score,
                        camera_id=self.camera_id,
                        person_key=result.key,
                        snapshot_path=snapshot_path,
                    )
                    if self.event_sink is not None:
                        self.event_sink(event)
                    else:
                        # Direct write: short-lived session keeps the SQLite write
                        # window tiny (ADR-002).
                        with session_scope(self.config) as session:
                            persist_event(session, event)
        except Exception:  # noqa: BLE001 - never let one camera kill the supervisor
            logger.exception("[%s] camera '%s' crashed", self.tenant_id, self.camera_name)
        finally:
            logger.info("[%s] worker for '%s' stopped", self.tenant_id, self.camera_name)
