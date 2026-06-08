"""Shared RTSP FrameBuffer — one background reader thread per camera URL.

Both Path A (recognition worker) and Path B (live MJPEG stream) import this
module so they reference the same global registry. When both paths run in the
same process they share one RTSP connection per camera. In subprocess
deployments each process maintains its own registry (one connection each).

Fix 5  — UDP transport: lower latency on LAN; reconnect logic handles drops.
Fix 8  — Frame expiry: get() returns None if the last frame is >2 s old,
          signalling a silent RTSP stall to the caller.
"""

from __future__ import annotations

import os
import threading
import time

import cv2
import numpy as np

# Fix 5 — Force UDP transport for lower latency on local networks.
# Other options reduce cold-connect delay and demux buffering.
# setdefault so a caller that already set the var is not overridden.
os.environ.setdefault(
    "OPENCV_FFMPEG_CAPTURE_OPTIONS",
    "|".join([
        "rtsp_transport;udp",       # low-latency local delivery
        "stimeout;5000000",         # 5 s FFmpeg socket stall timeout (µs)
        "buffer_size;4194304",      # 4 MB OS socket receive buffer
        "max_delay;200000",         # 200 ms max demux buffering delay (µs)
        "analyzeduration;500000",   # 0.5 s stream analysis (FFmpeg default 5 s)
        "probesize;500000",         # 500 KB probe — faster cold connect
        "fflags;nobuffer",          # pass packets to decoder immediately
    ]),
)

_FRAME_EXPIRY_SEC = 2.0  # Fix 8: frames older than this signal a stall


class FrameBuffer:
    """Reads RTSP at full camera FPS; always exposes the latest frame.

    A single daemon thread calls cap.read() continuously, replacing the
    stored frame on every successful read. Callers use get() which is O(1)
    and never blocks on I/O.

    get() returns None when:
      - The stream has not connected yet.
      - The stored frame is older than _FRAME_EXPIRY_SEC (Fix 8 — stall guard).
    """

    def __init__(self, rtsp_url: str) -> None:
        self._url = rtsp_url
        self._frame: np.ndarray | None = None
        self._frame_ts: float = 0.0        # monotonic time of last good frame
        self._lock = threading.Lock()
        self._alive = True
        t = threading.Thread(target=self._loop, daemon=True, name=f"fb:{rtsp_url[:40]}")
        t.start()

    def _loop(self) -> None:
        while self._alive:
            cap = cv2.VideoCapture(self._url, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            # Request hardware-accelerated decode when available (OpenCV ≥ 4.5.2).
            _hw_any = getattr(cv2, "VIDEO_ACCELERATION_ANY", None)
            _hw_prop = getattr(cv2, "CAP_PROP_HW_ACCELERATION", None)
            if _hw_any is not None and _hw_prop is not None:
                try:
                    cap.set(_hw_prop, _hw_any)
                except Exception:
                    pass

            if not cap.isOpened():
                time.sleep(3)
                continue

            fails = 0
            while self._alive:
                ret, frame = cap.read()
                if not ret:
                    fails += 1
                    if fails > 30:
                        break           # trigger reconnect
                    time.sleep(0.03)
                    continue
                fails = 0
                with self._lock:
                    self._frame = frame
                    self._frame_ts = time.monotonic()   # Fix 8: timestamp every frame

            cap.release()
            if self._alive:
                time.sleep(2)           # brief pause before reconnecting

    def get(self) -> np.ndarray | None:
        """Return the latest frame reference, or None if unavailable/stale."""
        with self._lock:
            if self._frame is None:
                return None
            # Fix 8: silent stall detection — frame hasn't been refreshed recently
            if time.monotonic() - self._frame_ts > _FRAME_EXPIRY_SEC:
                return None
            return self._frame   # no copy; resize/clone in the caller creates a new array

    def stop(self) -> None:
        self._alive = False


# ---------------------------------------------------------------------------
# Global registry — one FrameBuffer per RTSP URL per process.
# ---------------------------------------------------------------------------

_buffers: dict[str, FrameBuffer] = {}
_buf_lock = threading.Lock()


def get_buffer(rtsp_url: str) -> FrameBuffer:
    """Return the shared FrameBuffer for a URL, creating it on first call."""
    with _buf_lock:
        if rtsp_url not in _buffers:
            _buffers[rtsp_url] = FrameBuffer(rtsp_url)
        return _buffers[rtsp_url]
