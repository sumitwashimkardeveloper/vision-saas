"""YOLO-World detector for loading / unloading open-vocabulary object counting.

YOLO-World accepts dynamic text class prompts at inference time — no retraining
needed to switch between 'cartons', 'pallets', or any custom object the user
configures in the UI.  One LoadingDetector instance per CameraWorker thread.

Model download: ultralytics auto-downloads yolov8s-worldv2.pt on first use.
Swap for yolov8m-worldv2.pt or yolov8l-worldv2.pt for higher accuracy.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class LoadingDetection:
    label: str
    confidence: float
    bbox: tuple[float, float, float, float]  # x1, y1, x2, y2  (original frame px)
    track_id: int | None = None  # stable ByteTrack ID when tracking is used


class LoadingDetector:
    """Wraps YOLO-World for open-vocabulary object detection.

    Class names are updated at inference time via set_classes(), so the worker
    only reloads text embeddings when the user's object list changes.
    """

    def __init__(
        self,
        model_path: "str | Path" = "models/yolov8s-worldv2.pt",
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45,
        device: str = "auto",
    ) -> None:
        self.model_path = Path(model_path)
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        # "auto" → let ultralytics pick (CUDA if available, else CPU)
        self.device = None if device == "auto" else device
        self._model = None
        self._current_classes: list[str] = []

    # ── Private helpers ────────────────────────────────────────────────────

    def _ensure_loaded(self, class_names: list[str]) -> None:
        if self._model is None:
            try:
                from ultralytics import YOLOWorld  # noqa: PLC0415
            except ImportError as exc:
                raise ImportError(
                    "ultralytics >= 8.2 is required for loading/unloading detection. "
                    "Install it with:  pip install ultralytics"
                ) from exc

            if not self.model_path.exists():
                raise FileNotFoundError(
                    f"YOLO-World model not found at {self.model_path}. "
                    "Run:  python scripts/download_models.py"
                )

            logger.info("Loading YOLO-World model '%s' (device=%s) …",
                        self.model_path.name, self.device or "auto")
            self._model = YOLOWorld(str(self.model_path))
            if self.device:
                self._model.to(self.device)
            logger.info("YOLO-World model ready.")

        # Re-encode text embeddings only when the class list changes.
        if class_names != self._current_classes:
            self._model.set_classes(class_names)
            self._current_classes = list(class_names)
            logger.debug("YOLO-World classes updated: %s", class_names)

    # ── Public API ─────────────────────────────────────────────────────────

    def track(
        self, frame_bgr: np.ndarray, class_names: list[str]
    ) -> list[LoadingDetection]:
        """Run open-vocab detection WITH multi-object tracking (ByteTrack).

        Each detection carries a stable ``track_id`` so callers can count each
        distinct object once (conveyor-belt style cumulative counting).

        State is kept inside this model instance via ``persist=True``, so a
        LoadingDetector used for tracking must NOT be shared across cameras.
        """
        if not class_names:
            return []

        self._ensure_loaded(class_names)

        results = self._model.track(
            frame_bgr,
            conf=self.conf_threshold,
            iou=self.iou_threshold,
            persist=True,
            tracker="bytetrack.yaml",
            verbose=False,
        )
        return self._boxes_to_detections(results, class_names)

    @staticmethod
    def _boxes_to_detections(results, class_names: list[str]) -> list[LoadingDetection]:
        detections: list[LoadingDetection] = []
        for result in results:
            if result.boxes is None:
                continue
            for box in result.boxes:
                cls_idx = int(box.cls.item())
                label = (
                    class_names[cls_idx]
                    if cls_idx < len(class_names)
                    else "unknown"
                )
                x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
                track_id = int(box.id.item()) if getattr(box, "id", None) is not None else None
                detections.append(
                    LoadingDetection(
                        label=label,
                        confidence=float(box.conf.item()),
                        bbox=(x1, y1, x2, y2),
                        track_id=track_id,
                    )
                )
        return detections


def resolve_class_names(
    source: str,
    presets: list[str],
    customs: list[str],
) -> list[str]:
    """Return the effective class-name list for the given source setting."""
    if source == "preset":
        return [p.lower() for p in presets if p]
    if source == "custom":
        return [c.lower() for c in customs if c]
    # "both"
    seen: set[str] = set()
    result: list[str] = []
    for name in [p.lower() for p in presets] + [c.lower() for c in customs]:
        if name and name not in seen:
            seen.add(name)
            result.append(name)
    return result
