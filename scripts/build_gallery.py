"""Build (or rebuild) a tenant's face gallery from enrollment images.

Scans data/tenants/<tenant>/people/<key>/*.jpg, computes embeddings with
InsightFace, writes the embeddings cache (gallery.npz), and syncs People rows
into the DB so events can link to them.

Usage:
    python -m scripts.build_gallery --tenant tenant_001
"""

from __future__ import annotations

import argparse
import json
import logging

from apps.core.config import load_config
from apps.core.db import session_scope
from apps.core.detector import FaceDetector
from apps.core.gallery import build_gallery
from apps.core.repository import TenantRepository, ensure_tenant

logger = logging.getLogger("build_gallery")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a tenant's face gallery")
    parser.add_argument("--tenant", required=True, help="Tenant id (folder slug)")
    parser.add_argument("--config", help="Path to app.yaml")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    config = load_config(args.config)

    detector = FaceDetector(config.recognition)
    gallery = build_gallery(config, args.tenant, detector)

    # Sync DB People rows from the same metadata used for the gallery.
    meta_path = config.tenant_dir(args.tenant) / "people.json"
    meta = {}
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8")) or {}
        except json.JSONDecodeError:
            logger.warning("ignoring malformed people.json")

    with session_scope(config) as session:
        ensure_tenant(session, args.tenant)
        repo = TenantRepository(session, args.tenant)
        for key, name in zip(gallery.keys, gallery.names):
            info = meta.get(key, {})
            repo.upsert_person(
                external_key=key,
                name=name,
                role=info.get("role"),
                details=info.get("details"),
            )

    logger.info("gallery built for '%s': %d people enrolled", args.tenant, gallery.size)


if __name__ == "__main__":
    main()
