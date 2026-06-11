"""Per-tenant gallery: build per-image embeddings from enrolled images.

Each enrolled image produces one row in the gallery (instead of a mean).
This preserves angle-specific detail so right/left profile shots match
correctly during live recognition.

On-disk layout:
    data/tenants/<tenant>/people/<external_key>/*.jpg
    data/tenants/<tenant>/embeddings/gallery.npz
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from .config import AppConfig
from .detector import FaceDetector
from .recognizer import Gallery

logger = logging.getLogger(__name__)

_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


@dataclass
class GalleryBuildResult:
    gallery: Gallery
    enrolled: list[str] = field(default_factory=list)   # display names enrolled OK
    failed: list[str]   = field(default_factory=list)   # display names with no detectable face


def _load_people_meta(tenant_dir: Path) -> dict[str, dict]:
    meta_path = tenant_dir / "people.json"
    if not meta_path.exists():
        return {}
    try:
        return json.loads(meta_path.read_text(encoding="utf-8")) or {}
    except json.JSONDecodeError:
        logger.warning("Ignoring malformed people.json at %s", meta_path)
        return {}


def build_gallery(config: AppConfig, tenant_id: str, detector: FaceDetector) -> GalleryBuildResult:
    """Scan enrolled images and store one embedding per image.

    Returns a GalleryBuildResult with the gallery and lists of enrolled/failed names
    so callers can report failures to the user.
    """
    config.ensure_tenant_dirs(tenant_id)
    people_dir = config.people_dir(tenant_id)
    meta = _load_people_meta(config.tenant_dir(tenant_id))

    keys: list[str]            = []
    names: list[str]           = []
    all_embs: list[np.ndarray] = []
    person_idx: list[int]      = []
    enrolled_names: list[str]  = []
    failed_names: list[str]    = []

    person_dirs = sorted(p for p in people_dir.iterdir() if p.is_dir()) if people_dir.exists() else []

    for person_dir in person_dirs:
        key    = person_dir.name
        images = sorted(p for p in person_dir.iterdir() if p.suffix.lower() in _IMAGE_EXTS)
        display_name = meta.get(key, {}).get("name", key)

        if not images:
            logger.warning("[%s] no images for '%s' — skipping", tenant_id, key)
            failed_names.append(display_name)
            continue

        person_embs: list[np.ndarray] = []
        for img_path in images:
            image = cv2.imread(str(img_path))
            if image is None:
                logger.warning("[%s] unreadable image %s — skipping", tenant_id, img_path)
                continue
            emb = detector.embed_largest(image)
            if emb is None:
                logger.warning("[%s] no face detected in %s", tenant_id, img_path.name)
                continue
            norm = np.linalg.norm(emb)
            if norm > 0:
                emb = emb / norm
            person_embs.append(emb.astype(np.float32))

        if not person_embs:
            logger.warning("[%s] no usable faces for '%s' — person NOT enrolled", tenant_id, key)
            failed_names.append(display_name)
            continue

        p_idx = len(keys)
        keys.append(key)
        names.append(display_name)
        for emb in person_embs:
            all_embs.append(emb)
            person_idx.append(p_idx)

        enrolled_names.append(display_name)
        logger.info(
            "[%s] enrolled '%s' — %d embedding(s) from %d image(s)",
            tenant_id, display_name, len(person_embs), len(images),
        )

    embeddings_arr = (
        np.stack(all_embs).astype(np.float32)
        if all_embs
        else np.zeros((0, 512), dtype=np.float32)
    )
    gallery = Gallery(
        keys=keys,
        names=names,
        embeddings=embeddings_arr,
        person_indices=np.array(person_idx, dtype=np.int32),
    )
    save_gallery(config, tenant_id, gallery)

    if failed_names:
        logger.warning("[%s] %d person(s) NOT enrolled (no detectable face): %s",
                       tenant_id, len(failed_names), failed_names)

    return GalleryBuildResult(gallery=gallery, enrolled=enrolled_names, failed=failed_names)


def save_gallery(config: AppConfig, tenant_id: str, gallery: Gallery) -> Path:
    config.ensure_tenant_dirs(tenant_id)
    path = config.gallery_path(tenant_id)
    np.savez(
        path,
        keys=np.array(gallery.keys, dtype=object),
        names=np.array(gallery.names, dtype=object),
        embeddings=gallery.embeddings,
        person_indices=gallery.person_indices,
    )
    logger.info(
        "[%s] gallery saved — %d people, %d embeddings -> %s",
        tenant_id, gallery.size, len(gallery.embeddings), path,
    )
    return path


def load_gallery(config: AppConfig, tenant_id: str) -> Gallery:
    """Load cached gallery. Handles old format (no person_indices) gracefully."""
    path = config.gallery_path(tenant_id)
    if not path.exists():
        return Gallery(
            keys=[], names=[],
            embeddings=np.zeros((0, 512), dtype=np.float32),
            person_indices=np.array([], dtype=np.int32),
        )
    data = np.load(path, allow_pickle=True)
    embeddings = data["embeddings"].astype(np.float32)
    if "person_indices" in data:
        person_indices = data["person_indices"].astype(np.int32)
    else:
        person_indices = np.arange(len(embeddings), dtype=np.int32)

    return Gallery(
        keys=list(data["keys"]),
        names=list(data["names"]),
        embeddings=embeddings,
        person_indices=person_indices,
    )
