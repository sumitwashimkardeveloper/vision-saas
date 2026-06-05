"""Face detection + ArcFace embedding, with no compiled extensions (ADR-001).

Pipeline:
  1. Detect faces + 5 landmarks with OpenCV YuNet (cv2.FaceDetectorYN).
  2. Align each face to 112x112 using a similarity transform onto the canonical
     ArcFace landmark template.
  3. Embed with the ArcFace w600k_r50 ONNX model via ONNX Runtime.
Embeddings are L2-normalized 512-d vectors ready for cosine matching.

Models are loaded lazily so importing this module stays cheap.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .config import RecognitionConfig

EMBEDDING_DIM = 512

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
    """Detects faces (YuNet) and produces ArcFace embeddings (ONNX Runtime)."""

    def __init__(self, config: RecognitionConfig):
        self.config = config
        self._yunet = None
        self._arcface = None
        self._arc_input = None
        self._last_size: tuple[int, int] | None = None

    # ---- lazy model loading ----------------------------------------------
    def _ensure_loaded(self):
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
            self._arcface = ort.InferenceSession(str(rec_path), providers=list(self.config.providers))
            self._arc_input = self._arcface.get_inputs()[0].name

    @staticmethod
    def _normalize(vec: np.ndarray) -> np.ndarray:
        norm = np.linalg.norm(vec)
        return vec / norm if norm > 0 else vec

    def _align(self, image_bgr: np.ndarray, landmarks: np.ndarray) -> np.ndarray:
        """Warp a face to a 112x112 ArcFace-aligned crop using 5 landmarks."""
        # estimateAffinePartial2D yields a similarity transform (rotation + uniform
        # scale + translation), which is what ArcFace alignment expects.
        matrix, _ = cv2.estimateAffinePartial2D(landmarks, _ARCFACE_TEMPLATE, method=cv2.LMEDS)
        if matrix is None:
            # Fallback: center crop/resize if landmark fit fails.
            return cv2.resize(image_bgr, (112, 112))
        return cv2.warpAffine(image_bgr, matrix, (112, 112), borderValue=0.0)

    def _embed_aligned(self, aligned_bgr: np.ndarray) -> np.ndarray:
        # ArcFace expects RGB, (img - 127.5) / 128, NCHW. swapRB handles BGR->RGB.
        blob = cv2.dnn.blobFromImage(
            aligned_bgr, 1.0 / 128.0, (112, 112), (127.5, 127.5, 127.5), swapRB=True
        )
        out = self._arcface.run(None, {self._arc_input: blob})[0]
        return self._normalize(np.asarray(out[0], dtype=np.float32))

    # ---- public API -------------------------------------------------------
    def detect(self, image_bgr: np.ndarray) -> list[DetectedFace]:
        """Detect all faces in a BGR image and return their embeddings."""
        self._ensure_loaded()
        h, w = image_bgr.shape[:2]
        if self._last_size != (w, h):
            self._yunet.setInputSize((w, h))
            self._last_size = (w, h)

        _, faces = self._yunet.detect(image_bgr)
        results: list[DetectedFace] = []
        if faces is None:
            return results

        for f in faces:
            x, y, bw, bh = f[0:4]
            landmarks = f[4:14].reshape(5, 2).astype(np.float32)
            score = float(f[14])
            aligned = self._align(image_bgr, landmarks)
            embedding = self._embed_aligned(aligned)
            results.append(
                DetectedFace(
                    bbox=np.array([x, y, x + bw, y + bh], dtype=np.float32),
                    det_score=score,
                    embedding=embedding,
                )
            )
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
