"""MJPEG live stream with face-recognition and PPE overlay.

Fixes applied in this file:
  Fix 1  — Detection every 8th frame only; last known results drawn on every
            frame so the overlay never disappears between detections.
  Fix 2  — Stream detector uses det_size=(320,320) instead of (640,640).
            Halves YuNet inference time with negligible accuracy loss at
            the display resolution used for preview.
  Fix 3  — Three independent threads confirmed:
              Thread 1 (FrameBuffer)    : cap.read() at full camera FPS
              Thread 2 (DetectionThread): YuNet + ArcFace + PPE, never blocks stream
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
from apps.core.db import get_session_factory, session_scope
from apps.core.detector import FaceDetector
from apps.core.frame_buffer import get_buffer   # Fix 4: shared FrameBuffer from core
from apps.core.gallery import load_gallery
from apps.core.ppe_detector import PPEDetector, PPEDetection
from apps.core.recognizer import match
from apps.core.repository import TenantRepository

router = APIRouter(prefix="/stream", tags=["stream"])

_BOUNDARY = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
_TAIL = b"\r\n"

STREAM_FPS = 15        # max frames forwarded to the browser
STREAM_WIDTH = 854     # output width; height is proportional
DETECT_EVERY = 4       # run detection on 1 in every N frames (lower = less flicker)
_FEATURES_TTL = 30.0   # seconds between re-reads of enabled PPE features from DB
_PPE_HOLD_SECS = 2.0   # keep showing last PPE boxes this long after a face-miss


# ---------------------------------------------------------------------------
# Gallery cache — loaded once per tenant, reused across connections
# ---------------------------------------------------------------------------

_gallery_cache: dict[str, tuple] = {}   # tenant_id -> (Gallery, loaded_at)
_GALLERY_TTL = 5.0   # seconds; short so gallery rebuilds appear on stream quickly


def _get_gallery(config: AppConfig, tenant_id: str):
    now = time.time()
    entry = _gallery_cache.get(tenant_id)
    if entry is not None and now - entry[1] < _GALLERY_TTL:
        return entry[0]
    gallery = load_gallery(config, tenant_id)
    _gallery_cache[tenant_id] = (gallery, now)
    return gallery


# ---------------------------------------------------------------------------
# DetectionThread — face + PPE inference off the streaming thread (Fix 3)
# ---------------------------------------------------------------------------

class DetectionThread:
    """Runs face + PPE detection in a dedicated daemon thread.

    The streaming thread submits frames via submit(); this thread processes
    them as fast as inference allows. Results are read non-blocking via
    results() / ppe_results() — the streaming thread never waits on this.

    Uses det_size=(320,320) (Fix 2) to halve YuNet cost vs the worker's 640×640.
    """

    def __init__(self, config: AppConfig, tenant_id: str, camera_id: int) -> None:
        self._config = config
        self._tenant_id = tenant_id
        self._camera_id = camera_id

        # Fix 2: override det_size to 320×320 for the stream preview detector.
        stream_rec_cfg = dataclasses.replace(config.recognition, det_size=(320, 320))
        self._detector = FaceDetector(stream_rec_cfg)

        self._ppe: PPEDetector | None = (
            PPEDetector(config.ppe) if config.ppe.enabled else None
        )
        self._enabled_keys: set[str] = set()
        self._face_recognition_enabled: bool = False
        self._features_loaded_at: float = 0.0

        self._pending: np.ndarray | None = None
        self._pending_lock = threading.Lock()

        self._faces: list = []
        self._ppe_detections: list[PPEDetection] = []
        self._results_lock = threading.Lock()
        self._last_face_seen: float = 0.0  # monotonic time of last frame with faces

        self._trigger = threading.Event()
        self._alive = True
        t = threading.Thread(target=self._loop, daemon=True, name="stream-detect")
        t.start()

    def _refresh_features(self) -> None:
        now = time.monotonic()
        if now - self._features_loaded_at < _FEATURES_TTL:
            return
        try:
            from apps.core.ppe_registry import FACE_RECOGNITION_KEY, PPE_FEATURES_BY_KEY
            with session_scope(self._config) as session:
                repo = TenantRepository(session, self._tenant_id)
                # Per-camera: only features assigned to THIS camera are active.
                raw = repo.get_enabled_features_for_camera(self._camera_id)
            # Only keep keys that exist in the current registry.
            self._enabled_keys = {k for k in raw if k in PPE_FEATURES_BY_KEY}
            self._face_recognition_enabled = FACE_RECOGNITION_KEY in raw
            self._features_loaded_at = now
        except Exception:
            pass  # keep last known set on DB error

    def _loop(self) -> None:
        while self._alive:
            self._trigger.wait(timeout=1.0)
            self._trigger.clear()
            with self._pending_lock:
                frame = self._pending
            if frame is None:
                continue

            # Refresh toggle state up front so we can skip work that's off.
            self._refresh_features()
            run_ppe = self._ppe is not None and bool(self._enabled_keys)

            # Detect faces for recognition boxes AND as person-presence for PPE.
            # Skip entirely when both are off.
            faces = []
            if self._face_recognition_enabled or run_ppe:
                try:
                    faces = self._detector.detect(frame)
                except Exception:
                    faces = []

            now = time.monotonic()
            if faces:
                self._last_face_seen = now
                ppe_hits: list[PPEDetection] = []
                if run_ppe:
                    try:
                        ppe_hits = self._ppe.detect(frame, self._enabled_keys)
                    except FileNotFoundError:
                        self._ppe = None
                    except Exception:
                        pass
                with self._results_lock:
                    self._faces = faces
                    self._ppe_detections = ppe_hits
            else:
                # No face this cycle — clear face box immediately but hold PPE
                # results for _PPE_HOLD_SECS so brief misses don't cause flicker.
                with self._results_lock:
                    self._faces = []
                    if now - self._last_face_seen > _PPE_HOLD_SECS:
                        self._ppe_detections = []

    def submit(self, frame: np.ndarray) -> None:
        with self._pending_lock:
            self._pending = frame
        self._trigger.set()

    def results(self) -> tuple[list, list[PPEDetection]]:
        with self._results_lock:
            return list(self._faces), list(self._ppe_detections)

    def stop(self) -> None:
        self._alive = False
        self._trigger.set()


# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------

_SHORT_PPE = {
    "helmet_detection": "Helmet",
    "vest_detection": "Vest",
    "gloves_detection": "Gloves",
    "goggles_detection": "Goggles",
    "mask_detection": "Mask",
}


def _error_frame(text: str = "Camera unavailable") -> bytes:
    img = np.zeros((360, 640, 3), dtype=np.uint8)
    cv2.putText(img, text, (20, 190),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (90, 90, 90), 2, cv2.LINE_AA)
    _, jpeg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 60])
    return jpeg.tobytes()


def _estimate_body_bbox(
    face_bbox: np.ndarray, frame_h: int, frame_w: int
) -> tuple[int, int, int, int]:
    """Expand a face bbox downward/sideways to approximate the person's body region."""
    x1, y1, x2, y2 = face_bbox
    face_w = x2 - x1
    face_h = y2 - y1
    bx1 = int(max(0, x1 - face_w * 0.6))
    by1 = int(max(0, y1 - face_h * 0.3))
    bx2 = int(min(frame_w, x2 + face_w * 0.6))
    by2 = int(min(frame_h, y2 + face_h * 4.5))
    return bx1, by1, bx2, by2


def _assign_ppe_to_persons(
    faces: list,
    ppe_hits: list[PPEDetection],
    frame_h: int,
    frame_w: int,
) -> dict[int, set[str]]:
    """Return {person_index: set_of_detected_feature_keys}.

    Each PPE detection is assigned to the person whose estimated body region
    contains the detection centre. If multiple body regions overlap, the
    nearest face centre wins.
    """
    person_ppe: dict[int, set[str]] = {i: set() for i in range(len(faces))}
    body_regions = [_estimate_body_bbox(f.bbox, frame_h, frame_w) for f in faces]

    for det in ppe_hits:
        dx1, dy1, dx2, dy2 = det.bbox
        det_cx = (dx1 + dx2) / 2
        det_cy = (dy1 + dy2) / 2

        best_idx: int | None = None
        best_dist = float("inf")
        for i, (bx1, by1, bx2, by2) in enumerate(body_regions):
            if bx1 <= det_cx <= bx2 and by1 <= det_cy <= by2:
                fcx = (faces[i].bbox[0] + faces[i].bbox[2]) / 2
                fcy = (faces[i].bbox[1] + faces[i].bbox[3]) / 2
                dist = (det_cx - fcx) ** 2 + (det_cy - fcy) ** 2
                if dist < best_dist:
                    best_dist = dist
                    best_idx = i

        if best_idx is not None:
            person_ppe[best_idx].add(det.feature_key)

    return person_ppe


def _draw(
    frame: np.ndarray,
    faces: list,
    ppe_hits: list[PPEDetection],
    gallery,
    threshold: float,
    enabled_keys: set[str],
    draw_faces: bool = True,
) -> None:
    if not faces:
        return

    h, w = frame.shape[:2]
    run_ppe = bool(enabled_keys)
    person_ppe = _assign_ppe_to_persons(faces, ppe_hits, h, w) if run_ppe else {}

    for i, face in enumerate(faces):
        fx1, fy1, fx2, fy2 = (int(v) for v in face.bbox)

        # --- Single color-coded body box per person (PPE compliance) --------
        if run_ppe:
            detected = person_ppe.get(i, set())
            missing = enabled_keys - detected
            bx1, by1, bx2, by2 = _estimate_body_bbox(face.bbox, h, w)

            box_color = (0, 200, 60) if not missing else (0, 0, 220)  # green / red
            cv2.rectangle(frame, (bx1, by1), (bx2, by2), box_color, 2)

            status_label = (
                "PPE OK"
                if not missing
                else "Missing: " + ", ".join(_SHORT_PPE.get(k, k) for k in sorted(missing))
            )
            (tw, th), _ = cv2.getTextSize(status_label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            # Place label above the box; if it would clip the top, show it below instead.
            if by1 - th - 8 >= 0:
                lx1, ly1, lx2, ly2 = bx1, by1 - th - 8, bx1 + tw + 6, by1
            else:
                lx1, ly1, lx2, ly2 = bx1, by2, bx1 + tw + 6, by2 + th + 8
            cv2.rectangle(frame, (lx1, ly1), (lx2, ly2), box_color, cv2.FILLED)
            cv2.putText(frame, status_label, (lx1 + 3, ly2 - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)

        # --- Face recognition box (only when face recognition is enabled) ---
        if draw_faces:
            result = match(gallery, face.embedding, threshold)
            face_color = (0, 210, 80) if result.is_match else (50, 50, 240)
            label = f"{result.name}  {result.score:.2f}" if result.is_match else "unknown"
            cv2.rectangle(frame, (fx1, fy1), (fx2, fy2), face_color, 2)
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.52, 1)
            cv2.rectangle(frame, (fx1, fy1 - th - 10), (fx1 + tw + 6, fy1), face_color, cv2.FILLED)
            cv2.putText(frame, label, (fx1 + 3, fy1 - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 1, cv2.LINE_AA)


# ---------------------------------------------------------------------------
# MJPEG generator
# ---------------------------------------------------------------------------

def _mjpeg_gen(rtsp_url: str, config: AppConfig, tenant_id: str, camera_id: int):
    buf = get_buffer(rtsp_url)
    threshold = config.recognition.match_threshold
    detect = DetectionThread(config, tenant_id, camera_id)

    frame_gap = 1.0 / STREAM_FPS
    next_frame_t = time.time()
    frame_count = 0

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
                yield _BOUNDARY + _error_frame("Reconnecting…") + _TAIL
                continue

            h, w = raw.shape[:2]
            frame = cv2.resize(raw, (STREAM_WIDTH, int(h * STREAM_WIDTH / w)))

            # Fix 1: submit to detection only every DETECT_EVERY frames.
            frame_count += 1
            if frame_count % DETECT_EVERY == 0:
                detect.submit(frame)

            # Draw last known results on every frame.
            # Re-check gallery on every frame — the TTL cache makes this cheap,
            # and ensures a gallery rebuild is reflected within _GALLERY_TTL seconds.
            try:
                gallery = _get_gallery(config, tenant_id)
                faces, ppe_hits = detect.results()
                _draw(frame, faces, ppe_hits, gallery, threshold,
                      detect._enabled_keys, detect._face_recognition_enabled)
            except Exception:
                pass

            ok, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            if not ok:
                continue

            # Fix 9: exit cleanly on browser disconnect.
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
        _mjpeg_gen(cam.rtsp_url, config, tenant_id, camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
