"""YOLOv8n PPE detector wrapping the exported ONNX model.

ONNX output shape: (1, 4+num_classes, 8400)
  Channels 0-3         : bounding box in centre format (cx, cy, w, h) at 640×640 scale.
  Channels 4..4+C-1    : raw class logits, one per YOLO output class.

detect() accepts an enabled_keys set so the caller can skip inference entirely
when no PPE features are toggled on — zero inference cost at idle.

One instance per CameraWorker thread — ONNX Runtime sessions are not safe to
share across concurrent .run() calls.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .config import PPEConfig
from .ppe_registry import PPEFeatureDef, PPE_FEATURES_BY_KEY

logger = logging.getLogger(__name__)

_INPUT_SIZE = (640, 640)


@dataclass
class PPEDetection:
    feature_key: str
    label: str
    confidence: float
    bbox: tuple[float, float, float, float]  # x1, y1, x2, y2 in original frame coords


class PPEDetector:
    """Runs YOLOv8n PPE inference on BGR frames."""

    def __init__(self, config: PPEConfig) -> None:
        self.config = config
        self._session = None
        self._input_name: str | None = None
        # Map YOLO class index → PPEFeatureDef, built once on first load.
        self._class_to_feature: dict[int, PPEFeatureDef] = {}

    def _ensure_loaded(self) -> None:
        if self._session is not None:
            return
        import onnxruntime as ort

        model_path = self.config.model_path
        if not model_path.exists():
            raise FileNotFoundError(
                f"PPE model not found at {model_path}. "
                "Export your YOLOv8n PPE model to ONNX and place it there:\n"
                "  from ultralytics import YOLO\n"
                "  YOLO('best.pt').export(format='onnx')"
            )
        opts = ort.SessionOptions()
        opts.inter_op_num_threads = 2
        opts.intra_op_num_threads = 2
        self._session = ort.InferenceSession(
            str(model_path), opts, providers=list(self.config.providers)
        )
        self._input_name = self._session.get_inputs()[0].name

        # Build index → feature mapping from the configured class_names list.
        for idx, name in enumerate(self.config.class_names):
            lname = name.lower().strip()
            for feat in PPE_FEATURES_BY_KEY.values():
                if lname in feat.yolo_classes:
                    self._class_to_feature[idx] = feat
                    break

        logger.info(
            "PPE model loaded: %s (%d classes, %d mapped to features)",
            model_path.name,
            len(self.config.class_names),
            len(self._class_to_feature),
        )

    def detect(self, frame_bgr: np.ndarray, enabled_keys: set[str]) -> list[PPEDetection]:
        """Run PPE inference. Returns only detections whose feature key is in enabled_keys.

        Returns an empty list immediately (no inference) when enabled_keys is empty.
        """
        if not enabled_keys:
            return []
        self._ensure_loaded()

        orig_h, orig_w = frame_bgr.shape[:2]
        inp, scale, pad_x, pad_y = _letterbox(frame_bgr, _INPUT_SIZE)

        # BGR → RGB, normalize, NCHW, add batch dim
        blob = (
            inp[:, :, ::-1].astype(np.float32) / 255.0
        ).transpose(2, 0, 1)[np.newaxis]

        raw = self._session.run(None, {self._input_name: blob})[0]  # (1, 10, 8400)

        # Normalise to (num_anchors, 4+num_classes)
        if raw.ndim == 3:
            raw = raw[0]
        if raw.shape[0] < raw.shape[-1]:
            raw = raw.T  # (4+C, 8400) → (8400, 4+C)

        num_classes = len(self.config.class_names)
        boxes_cxcywh = raw[:, :4]
        class_scores  = raw[:, 4: 4 + num_classes]

        class_ids   = np.argmax(class_scores, axis=1)
        confidences = class_scores[np.arange(len(class_ids)), class_ids]

        mask = confidences >= self.config.conf_threshold
        if not mask.any():
            return []
        boxes_cxcywh = boxes_cxcywh[mask]
        confidences  = confidences[mask]
        class_ids    = class_ids[mask]

        # Centre → corner
        hw = boxes_cxcywh[:, 2:] / 2
        boxes_xyxy = np.concatenate(
            [boxes_cxcywh[:, :2] - hw, boxes_cxcywh[:, :2] + hw], axis=1
        )

        # Per-class NMS
        kept: list[int] = []
        for cls_id in np.unique(class_ids):
            cls_mask = class_ids == cls_id
            full_idx = np.where(cls_mask)[0]
            out = cv2.dnn.NMSBoxes(
                boxes_xyxy[cls_mask].tolist(),
                confidences[cls_mask].tolist(),
                self.config.conf_threshold,
                self.config.nms_threshold,
            )
            if len(out) > 0:
                kept.extend(full_idx[np.array(out).flatten()].tolist())

        results: list[PPEDetection] = []
        for i in kept:
            feat = self._class_to_feature.get(int(class_ids[i]))
            if feat is None or feat.key not in enabled_keys:
                continue
            # Scale back to original frame coordinates
            x1 = float(np.clip((boxes_xyxy[i, 0] - pad_x) / scale, 0, orig_w))
            y1 = float(np.clip((boxes_xyxy[i, 1] - pad_y) / scale, 0, orig_h))
            x2 = float(np.clip((boxes_xyxy[i, 2] - pad_x) / scale, 0, orig_w))
            y2 = float(np.clip((boxes_xyxy[i, 3] - pad_y) / scale, 0, orig_h))
            results.append(
                PPEDetection(
                    feature_key=feat.key,
                    label=feat.label,
                    confidence=float(confidences[i]),
                    bbox=(x1, y1, x2, y2),
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
    canvas[pad_y: pad_y + nh, pad_x: pad_x + nw] = resized
    return canvas, scale, float(pad_x), float(pad_y)
