"""Health check and read-only effective config (no secrets)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from apps.api.deps import get_config
from apps.core.config import AppConfig

router = APIRouter(tags=["meta"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/config")
def effective_config(config: AppConfig = Depends(get_config)) -> dict:
    """Non-secret runtime configuration (the auth secret is never exposed)."""
    rec = config.recognition
    stream = config.stream
    return {
        "recognition": {
            "detector_model": rec.detector_model,
            "recognition_model": rec.recognition_model,
            "providers": rec.providers,
            "det_size": list(rec.det_size),
            "det_thresh": rec.det_thresh,
            "match_threshold": rec.match_threshold,
            "log_unknowns": rec.log_unknowns,
        },
        "stream": {
            "target_fps": stream.target_fps,
            "reconnect_delay": stream.reconnect_delay,
            "open_timeout_ms": stream.open_timeout_ms,
            "read_timeout_ms": stream.read_timeout_ms,
        },
    }
