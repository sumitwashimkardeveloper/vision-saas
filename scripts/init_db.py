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

from alembic import command
from alembic.config import Config as AlembicConfig

from apps.core.config import PROJECT_ROOT, load_config
from apps.core.db import get_engine, session_scope
from apps.core.models import Base
from apps.core.repository import TenantRepository, ensure_tenant

logger = logging.getLogger("init_db")


def create_schema(config) -> None:
    """Run Alembic migrations if configured, else create tables directly."""
    alembic_ini = PROJECT_ROOT / "alembic.ini"
    if alembic_ini.exists():
        alembic_cfg = AlembicConfig(str(alembic_ini))
        alembic_cfg.set_main_option("sqlalchemy.url", config.db_url)
        command.upgrade(alembic_cfg, "head")
        logger.info("applied Alembic migrations -> head")
    else:
        Base.metadata.create_all(get_engine(config))
        logger.info("created schema via metadata.create_all (no alembic.ini found)")


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

    create_schema(config)
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
