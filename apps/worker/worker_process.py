"""A single worker OS process handling a group of cameras (Phase 4).

Each process runs its assigned cameras as CameraWorker threads, shares one
gallery per tenant and one EventBatcher, and periodically writes a heartbeat the
ProcessManager watches. Designed to be launched via multiprocessing (spawn-safe:
only picklable args, all heavy objects are built inside the child).
"""

from __future__ import annotations

import logging
import signal
from dataclasses import dataclass

from apps.core.config import load_config
from apps.core.gallery import load_gallery
from apps.core.recognizer import Gallery
from apps.worker.camera_worker import CameraWorker
from apps.worker.event_batcher import EventBatcher

logger = logging.getLogger("worker_process")


@dataclass
class CameraAssignment:
    tenant_id: str
    camera_id: int
    name: str
    rtsp_url: str


def run_worker_process(
    config_path: str | None,
    index: int,
    assignments: list[CameraAssignment],
    heartbeat,          # multiprocessing Manager().dict() proxy: index -> last epoch
    stop_event,         # multiprocessing Event
) -> None:
    # The manager owns Ctrl+C; children stop via the shared stop_event.
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    import time

    config = load_config(config_path)
    batcher = EventBatcher(config)

    galleries: dict[str, Gallery] = {}
    workers: list[CameraWorker] = []
    for a in assignments:
        if a.tenant_id not in galleries:
            galleries[a.tenant_id] = load_gallery(config, a.tenant_id)
        workers.append(
            CameraWorker(
                config,
                a.tenant_id,
                a.rtsp_url,
                a.camera_id,
                a.name,
                galleries[a.tenant_id],
                event_sink=batcher.add,
            )
        )

    logger.info("process %d starting %d camera(s)", index, len(workers))
    for w in workers:
        w.start()

    try:
        while not stop_event.is_set():
            heartbeat[index] = time.time()
            stop_event.wait(config.worker.heartbeat_interval_sec)
    finally:
        logger.info("process %d stopping", index)
        for w in workers:
            w.stop()
        for w in workers:
            w.join(timeout=10)
        batcher.stop()
        logger.info("process %d stopped", index)
