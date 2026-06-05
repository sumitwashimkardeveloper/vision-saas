"""Buffered, batched event writes (Phase 4).

Camera workers hand MatchEvents to ``add()`` (cheap, non-blocking). A background
thread flushes them to the DB in batches — by size or on a time interval — so
many cameras sharing one SQLite file don't each take the write lock per event
(ADR-002). Snapshots are still written per-event by the camera worker; only the
DB inserts are batched.
"""

from __future__ import annotations

import logging
import threading

from apps.core.config import AppConfig
from apps.core.db import session_scope
from apps.core.pipeline import MatchEvent, persist_events

logger = logging.getLogger("event_batcher")


class EventBatcher:
    def __init__(self, config: AppConfig):
        self.config = config
        self.batch_size = config.worker.event_batch_size
        self.interval = config.worker.event_batch_interval_sec
        self._buffer: list[MatchEvent] = []
        self._lock = threading.Lock()
        self._wake = threading.Event()   # set when a flush is due (full buffer or stop)
        self._stop = False
        self._thread = threading.Thread(target=self._run, name="event-batcher", daemon=True)
        self._thread.start()

    def add(self, event: MatchEvent) -> None:
        with self._lock:
            self._buffer.append(event)
            full = len(self._buffer) >= self.batch_size
        if full:
            self._wake.set()

    def _drain(self) -> list[MatchEvent]:
        with self._lock:
            if not self._buffer:
                return []
            batch, self._buffer = self._buffer, []
            return batch

    def _flush(self) -> None:
        batch = self._drain()
        if not batch:
            return
        try:
            with session_scope(self.config) as session:
                persist_events(session, batch)
            logger.debug("flushed %d event(s)", len(batch))
        except Exception:  # noqa: BLE001 - keep the batcher alive on transient DB errors
            logger.exception("failed to flush %d event(s)", len(batch))

    def _run(self) -> None:
        while not self._stop:
            # Wake on a full buffer or after the interval, whichever comes first.
            self._wake.wait(timeout=self.interval)
            self._wake.clear()
            self._flush()

    def stop(self) -> None:
        """Flush remaining events and stop the background thread."""
        self._stop = True
        self._wake.set()
        self._thread.join(timeout=10)
        self._flush()  # final drain in case anything arrived during shutdown
