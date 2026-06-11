"""PPE (Personal Protective Equipment) detection using a YOLOv8 ONNX model.

The model must be a YOLOv8 ONNX export trained on PPE/safety classes.
Obtain it by running: python -m scripts.download_models --ppe

The class_names list (from configs/app.yaml ppe.class_names) tells the detector
which YOLO output class index maps to which PPE item. It is matched against the
yolo_classes tuples in ppe_registry.py (case-insensitive).

Standard YOLOv8 ONNX output format:
  Input:  (1, 3, 640, 640) — normalized [0,1] RGB, NCHW
  Output: (1, 4+num_classes, 8400) — cx/cy/w/h + class scores per anchor

Letterboxing is used to preserve aspect ratio during resize.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .ppe_registry import PPEFeatureDef, PPE_FEATURES_BY_KEY

logger = logging.getLogger(__name__)

_MODEL_INPUT_SIZE = (640, 640)
_DEFAULT_CONF = 0.45
_DEFAULT_NMS = 0.45


@dataclass
class PPEDetection:
    feature_key: str
    label: str
    confidence: float
    bbox: np.ndarray  # [x1, y1, x2, y2] in original image coordinates


class PPEDetector:
    """Detects PPE items in a full BGR frame using a YOLOv8 ONNX model.

    Only loads the model when at least one PPE feature is enabled — so when all
    features are off this has zero inference cost.
    """

    def __init__(
        self,
        model_path: str | Path,
        class_names: list[str],
        providers: list[str] | None = None,
        conf_thresh: float = _DEFAULT_CONF,
        nms_thresh: float = _DEFAULT_NMS,
    ):
        self.model_path = Path(model_path)
        self.class_names = [n.lower().strip() for n in class_names]
        self.providers = providers or ["CPUExecutionProvider"]
        self.conf_thresh = conf_thresh
        self.nms_thresh = nms_thresh
        self._session = None
        self._input_name: str | None = None

        # Map YOLO class index → PPEFeatureDef (built once at construction)
        self._class_to_feature: dict[int, PPEFeatureDef] = {}
        for idx, name in enumerate(self.class_names):
            for feat in PPE_FEATURES_BY_KEY.values():
                if name in feat.yolo_classes:
                    self._class_to_feature[idx] = feat
                    break

    # ---- lazy model loading -----------------------------------------------

    def _ensure_loaded(self) -> None:
        if self._session is not None:
            return
        if not self.model_path.exists():
            raise FileNotFoundError(
                f"PPE model not found at {self.model_path}. "
                "Run: python -m scripts.download_models --ppe"
            )
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.inter_op_num_threads = 2
        opts.intra_op_num_threads = 2
        self._session = ort.InferenceSession(
            str(self.model_path), opts, providers=self.providers
        )
        self._input_name = self._session.get_inputs()[0].name
        logger.info("PPE model loaded from %s (%d classes)", self.model_path, len(self.class_names))

    # ---- public API -------------------------------------------------------

    def detect(self, image_bgr: np.ndarray, enabled_keys: set[str]) -> list[PPEDetection]:
        """Detect PPE items in a BGR frame, returning only enabled-feature hits."""
        if not enabled_keys:
            return []
        self._ensure_loaded()

        orig_h, orig_w = image_bgr.shape[:2]
        inp, scale, pad_x, pad_y = _letterbox(image_bgr, _MODEL_INPUT_SIZE)

        # BGR → RGB, normalize, NCHW, add batch dim
        inp = inp[:, :, ::-1].astype(np.float32) / 255.0
        inp = np.transpose(inp, (2, 0, 1))[np.newaxis]

        raw = self._session.run(None, {self._input_name: inp})[0]

        # Normalize shape to (num_anchors, 4 + num_classes)
        if raw.ndim == 3:
            raw = raw[0]
        if raw.shape[0] < raw.shape[-1]:
            # (4+C, 8400) → (8400, 4+C)
            raw = raw.T

        num_classes = len(self.class_names)
        boxes_cxcywh = raw[:, :4]
        class_scores = raw[:, 4 : 4 + num_classes]

        class_ids = np.argmax(class_scores, axis=1)
        confidences = class_scores[np.arange(len(class_ids)), class_ids]

        keep_mask = confidences >= self.conf_thresh
        boxes_cxcywh = boxes_cxcywh[keep_mask]
        confidences = confidences[keep_mask]
        class_ids = class_ids[keep_mask]

        if len(boxes_cxcywh) == 0:
            return []

        # cx/cy/w/h → x1/y1/x2/y2
        half_w = boxes_cxcywh[:, 2] / 2
        half_h = boxes_cxcywh[:, 3] / 2
        boxes_xyxy = np.stack(
            [
                boxes_cxcywh[:, 0] - half_w,
                boxes_cxcywh[:, 1] - half_h,
                boxes_cxcywh[:, 0] + half_w,
                boxes_cxcywh[:, 1] + half_h,
            ],
            axis=1,
        )

        # Per-class NMS
        kept: list[int] = []
        for cls_id in np.unique(class_ids):
            cls_mask = class_ids == cls_id
            idx_in_full = np.where(cls_mask)[0]
            nms_out = cv2.dnn.NMSBoxes(
                boxes_xyxy[cls_mask].tolist(),
                confidences[cls_mask].tolist(),
                self.conf_thresh,
                self.nms_thresh,
            )
            if len(nms_out) > 0:
                kept.extend(idx_in_full[np.array(nms_out).flatten()].tolist())

        results: list[PPEDetection] = []
        for i in kept:
            feat = self._class_to_feature.get(int(class_ids[i]))
            if feat is None or feat.key not in enabled_keys:
                continue
            # Scale coordinates back to original image space
            x1 = float(np.clip((boxes_xyxy[i, 0] - pad_x) / scale, 0, orig_w))
            y1 = float(np.clip((boxes_xyxy[i, 1] - pad_y) / scale, 0, orig_h))
            x2 = float(np.clip((boxes_xyxy[i, 2] - pad_x) / scale, 0, orig_w))
            y2 = float(np.clip((boxes_xyxy[i, 3] - pad_y) / scale, 0, orig_h))
            results.append(
                PPEDetection(
                    feature_key=feat.key,
                    label=feat.label,
                    confidence=float(confidences[i]),
                    bbox=np.array([x1, y1, x2, y2], dtype=np.float32),
                )
            )

        return results


def _letterbox(
    image: np.ndarray, target_size: tuple[int, int]
) -> tuple[np.ndarray, float, float, float]:
    """Resize with letterboxing. Returns (padded_image, scale, pad_x, pad_y)."""
    h, w = image.shape[:2]
    tw, th = target_size
    scale = min(tw / w, th / h)
    nw, nh = int(w * scale), int(h * scale)
    resized = cv2.resize(image, (nw, nh), interpolation=cv2.INTER_LINEAR)
    canvas = np.full((th, tw, 3), 114, dtype=np.uint8)
    pad_x = (tw - nw) // 2
    pad_y = (th - nh) // 2
    canvas[pad_y : pad_y + nh, pad_x : pad_x + nw] = resized
    return canvas, scale, float(pad_x), float(pad_y)
