"""Application configuration and filesystem layout.

Loads ``configs/app.yaml`` and exposes typed config objects plus helpers for
the per-tenant directory layout described in docs/plan.md. All paths are
resolved relative to the project root so the app is location-independent.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

# Project root = two levels up from this file (apps/core/config.py -> project root).
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_PATH = PROJECT_ROOT / "configs" / "app.yaml"


@dataclass(frozen=True)
class RecognitionConfig:
    # ONNX model files (resolved relative to project root). Fetched by
    # scripts/download_models.py.
    detector_model: str = "models/face_detection_yunet_2023mar.onnx"
    recognition_model: str = "models/w600k_r50.onnx"
    # ONNX Runtime execution providers, tried in order. Put
    # "CUDAExecutionProvider" first on GPU hosts.
    providers: list[str] = field(default_factory=lambda: ["CPUExecutionProvider"])
    # YuNet input size (w, h). Frames are resized to this for detection.
    det_size: tuple[int, int] = (640, 640)
    # YuNet detection confidence threshold (0..1).
    det_thresh: float = 0.6
    # YuNet NMS threshold.
    nms_thresh: float = 0.3
    # Cosine-similarity threshold for a positive ArcFace identity match (0..1).
    match_threshold: float = 0.38
    # Whether to log faces that match nobody as "unknown" events.
    log_unknowns: bool = False

    @property
    def detector_path(self) -> Path:
        return _resolve(self.detector_model)

    @property
    def recognition_path(self) -> Path:
        return _resolve(self.recognition_model)


@dataclass(frozen=True)
class StreamConfig:
    target_fps: float = 2.0
    reconnect_delay: float = 3.0
    max_read_failures: int = 30


@dataclass(frozen=True)
class AppConfig:
    data_dir: Path
    db_file: str
    recognition: RecognitionConfig
    stream: StreamConfig

    # ---- Derived paths ----------------------------------------------------
    @property
    def db_path(self) -> Path:
        return self.data_dir / self.db_file

    @property
    def db_url(self) -> str:
        # Forward slashes work for SQLAlchemy on every platform.
        return f"sqlite:///{self.db_path.as_posix()}"

    def tenant_dir(self, tenant_id: str) -> Path:
        return self.data_dir / "tenants" / tenant_id

    def people_dir(self, tenant_id: str) -> Path:
        return self.tenant_dir(tenant_id) / "people"

    def embeddings_dir(self, tenant_id: str) -> Path:
        return self.tenant_dir(tenant_id) / "embeddings"

    def gallery_path(self, tenant_id: str) -> Path:
        return self.embeddings_dir(tenant_id) / "gallery.npz"

    def snapshots_dir(self, tenant_id: str) -> Path:
        return self.data_dir / "snapshots" / tenant_id

    def ensure_tenant_dirs(self, tenant_id: str) -> None:
        for path in (
            self.people_dir(tenant_id),
            self.embeddings_dir(tenant_id),
            self.snapshots_dir(tenant_id),
        ):
            path.mkdir(parents=True, exist_ok=True)


def _resolve(path_str: str) -> Path:
    path = Path(path_str)
    return path if path.is_absolute() else (PROJECT_ROOT / path)


def load_config(path: Path | str | None = None) -> AppConfig:
    """Load the YAML config, falling back to dataclass defaults for missing keys."""
    cfg_path = Path(path) if path else DEFAULT_CONFIG_PATH
    raw = {}
    if cfg_path.exists():
        raw = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}

    storage = raw.get("storage", {})
    rec = raw.get("recognition", {})
    stream = raw.get("stream", {})

    recognition = RecognitionConfig(
        detector_model=rec.get("detector_model", RecognitionConfig.detector_model),
        recognition_model=rec.get("recognition_model", RecognitionConfig.recognition_model),
        providers=list(rec.get("providers", RecognitionConfig().providers)),
        det_size=tuple(rec.get("det_size", RecognitionConfig().det_size)),
        det_thresh=float(rec.get("det_thresh", RecognitionConfig.det_thresh)),
        nms_thresh=float(rec.get("nms_thresh", RecognitionConfig.nms_thresh)),
        match_threshold=float(rec.get("match_threshold", RecognitionConfig.match_threshold)),
        log_unknowns=bool(rec.get("log_unknowns", RecognitionConfig.log_unknowns)),
    )
    stream_cfg = StreamConfig(
        target_fps=float(stream.get("target_fps", StreamConfig.target_fps)),
        reconnect_delay=float(stream.get("reconnect_delay", StreamConfig.reconnect_delay)),
        max_read_failures=int(stream.get("max_read_failures", StreamConfig.max_read_failures)),
    )

    data_dir = _resolve(storage.get("data_dir", "data"))
    data_dir.mkdir(parents=True, exist_ok=True)

    return AppConfig(
        data_dir=data_dir,
        db_file=storage.get("db_file", "vision.db"),
        recognition=recognition,
        stream=stream_cfg,
    )
