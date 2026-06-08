"""Face detection + ArcFace embedding, with no compiled extensions (ADR-001).

Pipeline:
  1. Detect faces + 5 landmarks with OpenCV YuNet (cv2.FaceDetectorYN).
  2. Align each face to 112x112 using a similarity transform onto the canonical
     ArcFace landmark template.
  3. Embed with the ArcFace w600k_r50 ONNX model via ONNX Runtime.
Embeddings are L2-normalized 512-d vectors ready for cosine matching.

Fix 6  — ArcFace skip: if a face centre hasn't moved more than MOVE_THRESHOLD
          pixels since the last detect() call, the cached embedding is reused
          instead of running ArcFace again. YuNet still runs every call.
Fix 10 — Isolated ONNX sessions: each FaceDetector instance gets its own
          InferenceSession with capped thread counts so Path A and Path B do
          not share a session and queue inference requests against each other.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .config import RecognitionConfig

EMBEDDING_DIM = 512
MOVE_THRESHOLD = 20.0   # Fix 6: pixels; smaller → more cache hits, less accuracy drift

# Canonical 5-point landmark template for a 112x112 ArcFace crop
# (left eye, right eye, nose, left mouth corner, right mouth corner).
_ARCFACE_TEMPLATE = np.array(
    [
        [38.2946, 51.6963],
        [73.5318, 51.5014],
        [56.0252, 71.7366],
        [41.5493, 92.3655],
        [70.7299, 92.2041],
    ],
    dtype=np.float32,
)


@dataclass
class DetectedFace:
    bbox: np.ndarray          # [x1, y1, x2, y2]
    det_score: float
    embedding: np.ndarray     # L2-normalized, shape (512,)


class FaceDetector:
    """Detects faces (YuNet) and produces ArcFace embeddings (ONNX Runtime).

    Each instance owns its own ONNX InferenceSession (Fix 10) so concurrent
    callers in different threads don't serialize on a shared session.
    """

    def __init__(self, config: RecognitionConfig):
        self.config = config
        self._yunet = None
        self._arcface = None
        self._arc_input = None
        self._last_size: tuple[int, int] | None = None
        # Fix 6: per-instance cache of last bboxes and embeddings for movement check
        self._cached_boxes: list[np.ndarray] = []
        self._cached_embeddings: list[np.ndarray] = []

    # ---- lazy model loading ----------------------------------------------

    def _ensure_loaded(self) -> None:
        if self._yunet is None:
            det_path = self.config.detector_path
            if not det_path.exists():
                raise FileNotFoundError(
                    f"YuNet model not found at {det_path}. Run: python -m scripts.download_models"
                )
            self._yunet = cv2.FaceDetectorYN_create(
                str(det_path),
                "",
                tuple(self.config.det_size),
                self.config.det_thresh,
                self.config.nms_thresh,
                5000,
            )
        if self._arcface is None:
            import onnxruntime as ort

            rec_path = self.config.recognition_path
            if not rec_path.exists():
                raise FileNotFoundError(
                    f"ArcFace model not found at {rec_path}. Run: python -m scripts.download_models"
                )
            # Fix 10: isolated session options — cap threads so Path A and Path B
            # each get dedicated compute and don't queue against each other.
            sess_options = ort.SessionOptions()
            sess_options.inter_op_num_threads = 2
            sess_options.intra_op_num_threads = 2
            self._arcface = ort.InferenceSession(
                str(rec_path),
                sess_options,
                providers=list(self.config.providers),
            )
            self._arc_input = self._arcface.get_inputs()[0].name

    # ---- internal helpers ------------------------------------------------

    @staticmethod
    def _normalize(vec: np.ndarray) -> np.ndarray:
        norm = np.linalg.norm(vec)
        return vec / norm if norm > 0 else vec

    def _align(self, image_bgr: np.ndarray, landmarks: np.ndarray) -> np.ndarray:
        """Warp a face to a 112x112 ArcFace-aligned crop using 5 landmarks."""
        matrix, _ = cv2.estimateAffinePartial2D(landmarks, _ARCFACE_TEMPLATE, method=cv2.LMEDS)
        if matrix is None:
            return cv2.resize(image_bgr, (112, 112))
        return cv2.warpAffine(image_bgr, matrix, (112, 112), borderValue=0.0)

    def _embed_aligned(self, aligned_bgr: np.ndarray) -> np.ndarray:
        blob = cv2.dnn.blobFromImage(
            aligned_bgr, 1.0 / 128.0, (112, 112), (127.5, 127.5, 127.5), swapRB=True
        )
        out = self._arcface.run(None, {self._arc_input: blob})[0]
        return self._normalize(np.asarray(out[0], dtype=np.float32))

    def _find_cached_embedding(self, bbox: np.ndarray) -> np.ndarray | None:
        """Fix 6: return a cached embedding if this face centre is close to a
        previously detected face, meaning the person hasn't moved significantly."""
        cx = (bbox[0] + bbox[2]) / 2
        cy = (bbox[1] + bbox[3]) / 2
        for prev_box, prev_emb in zip(self._cached_boxes, self._cached_embeddings):
            px = (prev_box[0] + prev_box[2]) / 2
            py = (prev_box[1] + prev_box[3]) / 2
            if abs(cx - px) <= MOVE_THRESHOLD and abs(cy - py) <= MOVE_THRESHOLD:
                return prev_emb
        return None

    # ---- public API -------------------------------------------------------

    def detect(self, image_bgr: np.ndarray) -> list[DetectedFace]:
        """Detect all faces in a BGR image and return their embeddings.

        ArcFace is skipped for any face whose bounding-box centre hasn't moved
        more than MOVE_THRESHOLD pixels since the last call (Fix 6).
        """
        self._ensure_loaded()
        h, w = image_bgr.shape[:2]
        if self._last_size != (w, h):
            self._yunet.setInputSize((w, h))
            self._last_size = (w, h)

        _, faces = self._yunet.detect(image_bgr)

        if faces is None:
            # No faces — clear cache so next appearance triggers fresh embedding.
            self._cached_boxes = []
            self._cached_embeddings = []
            return []

        results: list[DetectedFace] = []
        new_boxes: list[np.ndarray] = []
        new_embeddings: list[np.ndarray] = []

        for f in faces:
            x, y, bw, bh = f[0:4]
            landmarks = f[4:14].reshape(5, 2).astype(np.float32)
            score = float(f[14])
            bbox = np.array([x, y, x + bw, y + bh], dtype=np.float32)

            # Fix 6: reuse cached embedding if face hasn't moved.
            embedding = self._find_cached_embedding(bbox)
            if embedding is None:
                aligned = self._align(image_bgr, landmarks)
                embedding = self._embed_aligned(aligned)

            new_boxes.append(bbox)
            new_embeddings.append(embedding)
            results.append(DetectedFace(bbox=bbox, det_score=score, embedding=embedding))

        # Update cache for the next call.
        self._cached_boxes = new_boxes
        self._cached_embeddings = new_embeddings
        return results

    def embed_largest(self, image_bgr: np.ndarray) -> np.ndarray | None:
        """Return the embedding of the largest face (used during enrollment)."""
        faces = self.detect(image_bgr)
        if not faces:
            return None
        largest = max(
            faces,
            key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
        )
        return largest.embedding
