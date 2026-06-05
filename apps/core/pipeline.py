"""Event pipeline: write a snapshot to disk and a tenant-scoped event row.

Snapshots are stored under data/snapshots/<tenant>/ and the DB event records
the relative path so the UI (Phase 5) can render them.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import cv2
import numpy as np

from .config import AppConfig
from .recognizer import MatchResult
from .repository import TenantRepository

logger = logging.getLogger(__name__)


def _timestamp_slug() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")


def save_snapshot(config: AppConfig, tenant_id: str, frame: np.ndarray, label: str) -> str | None:
    """Persist a snapshot frame, returning a path relative to the data dir."""
    config.ensure_tenant_dirs(tenant_id)
    safe_label = "".join(c if c.isalnum() or c in "-_" else "_" for c in label) or "unknown"
    filename = f"{_timestamp_slug()}_{safe_label}.jpg"
    abs_path = config.snapshots_dir(tenant_id) / filename
    if not cv2.imwrite(str(abs_path), frame):
        logger.warning("[%s] failed to write snapshot %s", tenant_id, abs_path)
        return None
    return str(abs_path.relative_to(config.data_dir).as_posix())


def record_match(
    config: AppConfig,
    repo: TenantRepository,
    result: MatchResult,
    frame: np.ndarray,
    camera_id: int | None = None,
    save_snapshot_image: bool = True,
) -> None:
    """Persist one recognition result as an event (+ snapshot).

    The caller decides whether to call this (e.g. skip unknowns when
    recognition.log_unknowns is false).
    """
    person_id = None
    if result.is_match and result.key is not None:
        person = repo.get_person_by_key(result.key)
        person_id = person.id if person else None

    snapshot_path = (
        save_snapshot(config, repo.tenant_id, frame, result.name)
        if save_snapshot_image
        else None
    )
    repo.add_event(
        label=result.name,
        score=result.score,
        camera_id=camera_id,
        person_id=person_id,
        snapshot_path=snapshot_path,
    )
    logger.info(
        "[%s] event: %s (score=%.3f, camera=%s)",
        repo.tenant_id,
        result.name,
        result.score,
        camera_id,
    )
