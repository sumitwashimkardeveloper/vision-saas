"""RTSP frame reader with stable reconnect and frame-rate sampling.

Yields frames at roughly ``target_fps`` regardless of the source FPS, and
transparently reconnects when the stream drops. Designed to be iterated:

    for frame in RTSPStream(url, stream_cfg).frames():
        ...
"""

from __future__ import annotations

import logging
import time
from typing import Iterator

import cv2
import numpy as np

from .config import StreamConfig

logger = logging.getLogger(__name__)


class RTSPStream:
    def __init__(self, url: str, config: StreamConfig, name: str = "stream"):
        self.url = url
        self.config = config
        self.name = name
        self._cap: cv2.VideoCapture | None = None
        self._stop = False

    def _open(self) -> bool:
        self._release()
        # FFMPEG backend is the most reliable for RTSP across platforms.
        cap = cv2.VideoCapture(self.url, cv2.CAP_FFMPEG)
        # Keep buffer small so we read fresh frames, not a stale backlog.
        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass
        if not cap.isOpened():
            cap.release()
            logger.warning("[%s] failed to open %s", self.name, self.url)
            return False
        self._cap = cap
        logger.info("[%s] connected to %s", self.name, self.url)
        return True

    def _release(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None

    def stop(self) -> None:
        self._stop = True

    def frames(self) -> Iterator[np.ndarray]:
        """Yield sampled BGR frames, reconnecting as needed, until stop()."""
        min_interval = 1.0 / self.config.target_fps if self.config.target_fps > 0 else 0.0
        last_emit = 0.0
        failures = 0

        while not self._stop:
            if self._cap is None and not self._open():
                time.sleep(self.config.reconnect_delay)
                continue

            ok, frame = self._cap.read()
            if not ok or frame is None:
                failures += 1
                if failures >= self.config.max_read_failures:
                    logger.warning("[%s] %d read failures — reconnecting", self.name, failures)
                    self._release()
                    failures = 0
                    time.sleep(self.config.reconnect_delay)
                continue

            failures = 0
            now = time.monotonic()
            if now - last_emit < min_interval:
                # Drop frames we don't need to keep the recognition rate near target_fps.
                continue
            last_emit = now
            yield frame

        self._release()
