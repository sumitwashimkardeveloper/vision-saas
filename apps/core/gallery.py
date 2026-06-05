"""Per-tenant gallery: build embeddings from enrolled images and cache them.

On-disk layout (see docs/plan.md):
    data/tenants/<tenant>/people/<external_key>/*.jpg   # enrollment images
    data/tenants/<tenant>/people.json                   # optional metadata
    data/tenants/<tenant>/embeddings/gallery.npz        # cached embeddings

``people.json`` (optional) maps external_key -> metadata:
    {"alice": {"name": "Alice Smith", "role": "staff", "details": "..."}, ...}
If absent, the folder name is used as both key and display name.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import cv2
import numpy as np

from .config import AppConfig
from .detector import FaceDetector
from .recognizer import Gallery

logger = logging.getLogger(__name__)

_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def _load_people_meta(tenant_dir: Path) -> dict[str, dict]:
    meta_path = tenant_dir / "people.json"
    if not meta_path.exists():
        return {}
    try:
        return json.loads(meta_path.read_text(encoding="utf-8")) or {}
    except json.JSONDecodeError:
        logger.warning("Ignoring malformed people.json at %s", meta_path)
        return {}


def build_gallery(config: AppConfig, tenant_id: str, detector: FaceDetector) -> Gallery:
    """Scan a tenant's people folders, compute a mean embedding per person,
    and write the gallery cache. Returns the in-memory gallery."""
    config.ensure_tenant_dirs(tenant_id)
    people_dir = config.people_dir(tenant_id)
    meta = _load_people_meta(config.tenant_dir(tenant_id))

    keys: list[str] = []
    names: list[str] = []
    vectors: list[np.ndarray] = []

    person_dirs = sorted(p for p in people_dir.iterdir() if p.is_dir()) if people_dir.exists() else []
    for person_dir in person_dirs:
        key = person_dir.name
        images = sorted(p for p in person_dir.iterdir() if p.suffix.lower() in _IMAGE_EXTS)
        if not images:
            logger.warning("[%s] no images for person '%s' — skipping", tenant_id, key)
            continue

        embeddings: list[np.ndarray] = []
        for img_path in images:
            image = cv2.imread(str(img_path))
            if image is None:
                logger.warning("[%s] unreadable image %s — skipping", tenant_id, img_path)
                continue
            emb = detector.embed_largest(image)
            if emb is None:
                logger.warning("[%s] no face found in %s — skipping", tenant_id, img_path)
                continue
            embeddings.append(emb)

        if not embeddings:
            logger.warning("[%s] no usable faces for '%s' — skipping", tenant_id, key)
            continue

        # Mean of L2-normalized embeddings, renormalized.
        mean = np.mean(np.stack(embeddings), axis=0)
        norm = np.linalg.norm(mean)
        if norm > 0:
            mean = mean / norm

        display_name = meta.get(key, {}).get("name", key)
        keys.append(key)
        names.append(display_name)
        vectors.append(mean.astype(np.float32))
        logger.info("[%s] enrolled '%s' (%s) from %d image(s)", tenant_id, key, display_name, len(embeddings))

    embeddings_arr = (
        np.stack(vectors) if vectors else np.zeros((0, 512), dtype=np.float32)
    )
    gallery = Gallery(keys=keys, names=names, embeddings=embeddings_arr)
    save_gallery(config, tenant_id, gallery)
    return gallery


def save_gallery(config: AppConfig, tenant_id: str, gallery: Gallery) -> Path:
    config.ensure_tenant_dirs(tenant_id)
    path = config.gallery_path(tenant_id)
    np.savez(
        path,
        keys=np.array(gallery.keys, dtype=object),
        names=np.array(gallery.names, dtype=object),
        embeddings=gallery.embeddings,
    )
    logger.info("[%s] wrote gallery cache (%d people) -> %s", tenant_id, gallery.size, path)
    return path


def load_gallery(config: AppConfig, tenant_id: str) -> Gallery:
    """Load the cached gallery; returns an empty gallery if none exists yet."""
    path = config.gallery_path(tenant_id)
    if not path.exists():
        return Gallery(keys=[], names=[], embeddings=np.zeros((0, 512), dtype=np.float32))
    data = np.load(path, allow_pickle=True)
    return Gallery(
        keys=list(data["keys"]),
        names=list(data["names"]),
        embeddings=data["embeddings"].astype(np.float32),
    )
