"""Application configuration and filesystem layout.

Loads ``configs/app.yaml`` and exposes typed config objects plus helpers for
the per-tenant directory layout described in docs/plan.md. All paths are
resolved relative to the project root so the app is location-independent.
"""

from __future__ import annotations

import os
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
    # Bound how long opening/reading an RTSP stream may block, so a dead camera
    # fails fast and shutdown stays responsive.
    open_timeout_ms: int = 5000
    read_timeout_ms: int = 5000


@dataclass(frozen=True)
class AuthConfig:
    # Override in production via the VISION_SECRET_KEY environment variable.
    secret_key: str = "dev-only-change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 720  # 12 hours


@dataclass(frozen=True)
class WorkerConfig:
    # Phase 4 scaling. The ProcessManager spawns one OS process per group of
    # this many cameras; each process runs its cameras as threads.
    cameras_per_process: int = 4
    # Event writes are buffered and flushed in batches to ease SQLite's
    # single-writer contention under many concurrent cameras (ADR-002).
    event_batch_size: int = 20
    event_batch_interval_sec: float = 2.0
    # Watchdog: each worker process heartbeats; the manager restarts a process
    # that dies or whose heartbeat goes stale.
    heartbeat_interval_sec: float = 5.0
    heartbeat_timeout_sec: float = 30.0
    watchdog_poll_sec: float = 2.0
    restart_backoff_sec: float = 5.0


@dataclass(frozen=True)
class AppConfig:
    data_dir: Path
    db_file: str
    recognition: RecognitionConfig
    stream: StreamConfig
    auth: AuthConfig
    worker: WorkerConfig = field(default_factory=WorkerConfig)

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
    auth = raw.get("auth", {})
    worker = raw.get("worker", {})

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
        open_timeout_ms=int(stream.get("open_timeout_ms", StreamConfig.open_timeout_ms)),
        read_timeout_ms=int(stream.get("read_timeout_ms", StreamConfig.read_timeout_ms)),
    )

    # Secret precedence: env var > app.yaml > insecure default (dev only).
    secret_key = (
        os.environ.get("VISION_SECRET_KEY")
        or auth.get("secret_key")
        or AuthConfig.secret_key
    )
    auth_cfg = AuthConfig(
        secret_key=secret_key,
        algorithm=auth.get("algorithm", AuthConfig.algorithm),
        access_token_expire_minutes=int(
            auth.get("access_token_expire_minutes", AuthConfig.access_token_expire_minutes)
        ),
    )

    worker_cfg = WorkerConfig(
        cameras_per_process=int(worker.get("cameras_per_process", WorkerConfig.cameras_per_process)),
        event_batch_size=int(worker.get("event_batch_size", WorkerConfig.event_batch_size)),
        event_batch_interval_sec=float(
            worker.get("event_batch_interval_sec", WorkerConfig.event_batch_interval_sec)
        ),
        heartbeat_interval_sec=float(
            worker.get("heartbeat_interval_sec", WorkerConfig.heartbeat_interval_sec)
        ),
        heartbeat_timeout_sec=float(
            worker.get("heartbeat_timeout_sec", WorkerConfig.heartbeat_timeout_sec)
        ),
        watchdog_poll_sec=float(worker.get("watchdog_poll_sec", WorkerConfig.watchdog_poll_sec)),
        restart_backoff_sec=float(worker.get("restart_backoff_sec", WorkerConfig.restart_backoff_sec)),
    )

    data_dir = _resolve(storage.get("data_dir", "data"))
    data_dir.mkdir(parents=True, exist_ok=True)

    return AppConfig(
        data_dir=data_dir,
        db_file=storage.get("db_file", "vision.db"),
        recognition=recognition,
        stream=stream_cfg,
        auth=auth_cfg,
        worker=worker_cfg,
    )
