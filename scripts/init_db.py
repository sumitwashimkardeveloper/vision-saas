"""Initialize the local database and (optionally) seed a tenant + camera.

Creates the schema via Alembic if migrations are present, otherwise falls back
to ``Base.metadata.create_all``. Then ensures a tenant exists and its on-disk
folders are created.

Usage:
    python -m scripts.init_db --tenant tenant_001 --name "Acme HQ"
    python -m scripts.init_db --tenant tenant_001 --camera "Front Door" --rtsp rtsp://...
"""

from __future__ import annotations

import argparse
import logging

from apps.core.config import load_config
from apps.core.db import ensure_schema, session_scope
from apps.core.repository import TenantRepository, ensure_tenant

logger = logging.getLogger("init_db")


def main() -> None:
    parser = argparse.ArgumentParser(description="Initialize DB and seed a tenant")
    parser.add_argument("--tenant", required=True, help="Tenant id (folder slug)")
    parser.add_argument("--name", help="Tenant display name")
    parser.add_argument("--camera", help="Optional camera name to add")
    parser.add_argument("--rtsp", help="RTSP URL for the camera")
    parser.add_argument("--config", help="Path to app.yaml")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    config = load_config(args.config)

    ensure_schema(config)
    config.ensure_tenant_dirs(args.tenant)

    with session_scope(config) as session:
        ensure_tenant(session, args.tenant, args.name)
        if args.camera:
            if not args.rtsp:
                parser.error("--camera requires --rtsp")
            repo = TenantRepository(session, args.tenant)
            repo.upsert_camera(args.camera, args.rtsp)
            logger.info("added/updated camera '%s' for tenant '%s'", args.camera, args.tenant)

    logger.info("tenant '%s' ready (data dir: %s)", args.tenant, config.tenant_dir(args.tenant))


if __name__ == "__main__":
    main()
