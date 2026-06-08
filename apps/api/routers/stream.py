"""MJPEG live stream with face-recognition overlay.

Fixes applied in this file:
  Fix 1  — Detection every 8th frame only; last known results drawn on every
            frame so the overlay never disappears between detections.
  Fix 2  — Stream detector uses det_size=(320,320) instead of (640,640).
            Halves YuNet inference time with negligible accuracy loss at
            the display resolution used for preview.
  Fix 3  — Three independent threads confirmed:
              Thread 1 (FrameBuffer)    : cap.read() at full camera FPS
              Thread 2 (DetectionThread): YuNet + ArcFace, never blocks stream
              Thread 3 (_mjpeg_gen)     : resize → draw → encode → yield
  Fix 9  — yield wrapped in try/except so browser disconnect exits cleanly
            rather than leaving a zombie streaming thread.
"""

from __future__ import annotations

import dataclasses
import threading
import time

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from apps.api.deps import get_config
from apps.api.security import decode_access_token
from apps.core.config import AppConfig
from apps.core.db import get_session_factory
from apps.core.detector import FaceDetector
from apps.core.frame_buffer import get_buffer   # Fix 4: shared FrameBuffer from core
from apps.core.gallery import load_gallery
from apps.core.recognizer import match
from apps.core.repository import TenantRepository

router = APIRouter(prefix="/stream", tags=["stream"])

_BOUNDARY = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
_TAIL = b"\r\n"

STREAM_FPS = 15        # max frames forwarded to the browser
STREAM_WIDTH = 854     # output width; height is proportional
DETECT_EVERY = 8       # Fix 1: run detection on 1 in every N frames


# ---------------------------------------------------------------------------
# Gallery cache — loaded once per tenant, reused across connections
# ---------------------------------------------------------------------------

_gallery_cache: dict[str, tuple] = {}   # tenant_id -> (Gallery, loaded_at)
_GALLERY_TTL = 30.0


def _get_gallery(config: AppConfig, tenant_id: str):
    now = time.time()
    entry = _gallery_cache.get(tenant_id)
    if entry is not None and now - entry[1] < _GALLERY_TTL:
        return entry[0]
    gallery = load_gallery(config, tenant_id)
    _gallery_cache[tenant_id] = (gallery, now)
    return gallery


# ---------------------------------------------------------------------------
# DetectionThread — ONNX inference off the streaming thread (Fix 3)
# ---------------------------------------------------------------------------

class DetectionThread:
    """Runs face detection in a dedicated daemon thread.

    The streaming thread submits frames via submit(); this thread processes
    them as fast as inference allows, always consuming the latest submitted
    frame (stale frames are dropped automatically). Results are read
    non-blocking via results() — the streaming thread never waits on this.

    Uses det_size=(320,320) (Fix 2) to halve YuNet cost vs the worker's
    640×640 — acceptable for preview quality at STREAM_WIDTH resolution.
    """

    def __init__(self, config: AppConfig) -> None:
        # Fix 2: override det_size to 320×320 for the stream preview detector.
        stream_rec_cfg = dataclasses.replace(config.recognition, det_size=(320, 320))
        self._detector = FaceDetector(stream_rec_cfg)
        self._pending: np.ndarray | None = None
        self._pending_lock = threading.Lock()
        self._faces: list = []
        self._faces_lock = threading.Lock()
        self._trigger = threading.Event()
        self._alive = True
        t = threading.Thread(target=self._loop, daemon=True, name="stream-detect")
        t.start()

    def _loop(self) -> None:
        while self._alive:
            self._trigger.wait(timeout=1.0)
            self._trigger.clear()
            with self._pending_lock:
                frame = self._pending
            if frame is None:
                continue
            try:
                faces = self._detector.detect(frame)
            except Exception:
                faces = []
            with self._faces_lock:
                self._faces = faces

    def submit(self, frame: np.ndarray) -> None:
        """Feed the latest frame; replaces any unprocessed pending frame."""
        with self._pending_lock:
            self._pending = frame
        self._trigger.set()

    def results(self) -> list:
        """Return the most recent detection results (never blocks)."""
        with self._faces_lock:
            return list(self._faces)

    def stop(self) -> None:
        self._alive = False
        self._trigger.set()


# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------

def _error_frame(text: str = "Camera unavailable") -> bytes:
    img = np.zeros((360, 640, 3), dtype=np.uint8)
    cv2.putText(img, text, (20, 190),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (90, 90, 90), 2, cv2.LINE_AA)
    _, jpeg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 60])
    return jpeg.tobytes()


def _draw(frame: np.ndarray, faces, gallery, threshold: float) -> None:
    for face in faces:
        x1, y1, x2, y2 = (int(v) for v in face.bbox)
        result = match(gallery, face.embedding, threshold)
        color = (0, 210, 80) if result.is_match else (50, 50, 240)
        label = f"{result.name}  {result.score:.2f}" if result.is_match else "unknown"
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.52, 1)
        cv2.rectangle(frame, (x1, y1 - th - 10), (x1 + tw + 6, y1), color, cv2.FILLED)
        cv2.putText(frame, label, (x1 + 3, y1 - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 1, cv2.LINE_AA)


# ---------------------------------------------------------------------------
# MJPEG generator
# ---------------------------------------------------------------------------

def _mjpeg_gen(rtsp_url: str, config: AppConfig, tenant_id: str):
    buf = get_buffer(rtsp_url)              # Fix 4: shared FrameBuffer from core
    gallery = _get_gallery(config, tenant_id)
    threshold = config.recognition.match_threshold
    detect = DetectionThread(config)        # Fix 2+10: 320×320, isolated ONNX session

    frame_gap = 1.0 / STREAM_FPS
    next_frame_t = time.time()
    frame_count = 0                         # Fix 1: counter for detection throttle

    # Wait up to 6 s for the FrameBuffer thread to connect.
    deadline = time.time() + 6
    while buf.get() is None and time.time() < deadline:
        yield _BOUNDARY + _error_frame("Connecting…") + _TAIL
        time.sleep(0.5)

    try:
        while True:
            now = time.time()
            wait = next_frame_t - now
            if wait > 0:
                time.sleep(wait)
            next_frame_t = time.time() + frame_gap

            raw = buf.get()
            if raw is None:
                # Fix 8: None means stream is unavailable or stale (see frame_buffer.py)
                yield _BOUNDARY + _error_frame("Reconnecting…") + _TAIL
                continue

            # Resize to display width — proportional height, new array, no copy needed.
            h, w = raw.shape[:2]
            frame = cv2.resize(raw, (STREAM_WIDTH, int(h * STREAM_WIDTH / w)))

            # Fix 1: submit to detection only every DETECT_EVERY frames.
            frame_count += 1
            if frame_count % DETECT_EVERY == 0:
                detect.submit(frame)

            # Draw last known results — always, even on non-detection frames.
            try:
                _draw(frame, detect.results(), gallery, threshold)
            except Exception:
                pass

            ok, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            if not ok:
                continue

            # Fix 9: exit cleanly on browser disconnect instead of blocking forever.
            try:
                yield _BOUNDARY + jpeg.tobytes() + _TAIL
            except (GeneratorExit, ConnectionResetError, BrokenPipeError):
                break

    finally:
        detect.stop()


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.get("/cameras/{camera_id}")
def stream_camera(
    camera_id: int,
    token: str = Query(...),
    config: AppConfig = Depends(get_config),
):
    try:
        payload = decode_access_token(config.auth, token)
        tenant_id: str = payload["tenant_id"]
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    session = get_session_factory(config)()
    try:
        repo = TenantRepository(session, tenant_id)
        cam = next((c for c in repo.list_cameras() if c.id == camera_id), None)
    finally:
        session.close()

    if cam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    return StreamingResponse(
        _mjpeg_gen(cam.rtsp_url, config, tenant_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
