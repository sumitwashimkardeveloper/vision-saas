"""Database engine and session factory.

SQLite is configured with WAL mode and foreign-key enforcement so the same
connection behaviour holds whether we run one worker or many (ADR-002).
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from .config import AppConfig

_engine: Engine | None = None
_SessionFactory: sessionmaker[Session] | None = None


def _configure_sqlite(dbapi_conn, _record) -> None:
    """Apply per-connection SQLite pragmas (WAL + FK enforcement)."""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


def get_engine(config: AppConfig) -> Engine:
    global _engine
    if _engine is None:
        config.db_path.parent.mkdir(parents=True, exist_ok=True)
        _engine = create_engine(config.db_url, future=True)
        if config.db_url.startswith("sqlite"):
            event.listen(_engine, "connect", _configure_sqlite)
    return _engine


def get_session_factory(config: AppConfig) -> sessionmaker[Session]:
    global _SessionFactory
    if _SessionFactory is None:
        _SessionFactory = sessionmaker(bind=get_engine(config), expire_on_commit=False, future=True)
    return _SessionFactory


def ensure_schema(config: AppConfig) -> None:
    """Create the DB schema if it doesn't exist yet.

    Idempotent and safe to call on every API startup, so a fresh install can
    register a tenant without a separate ``init_db`` step.

    Fast path: if the core tables already exist we return immediately and never
    touch Alembic. That keeps normal restarts instant and — importantly — avoids
    Alembic's in-process ``fileConfig`` call, which would otherwise reconfigure
    logging and silence uvicorn's startup banner.
    """
    from sqlalchemy import inspect

    engine = get_engine(config)
    inspector = inspect(engine)
    if inspector.has_table("tenants") and inspector.has_table("users"):
        # Core schema exists. Create any new tables added since initial deploy.
        from .models import Base
        from sqlalchemy import text as _text
        for tbl in ("tenant_features", "loading_unloading_configs"):
            if not inspector.has_table(tbl):
                Base.metadata.tables[tbl].create(engine)
        # Add camera_ids column if the table exists but lacks it (online migration).
        if inspector.has_table("loading_unloading_configs"):
            existing_cols = {c["name"] for c in inspector.get_columns("loading_unloading_configs")}
            if "camera_ids" not in existing_cols:
                with engine.connect() as conn:
                    conn.execute(_text("ALTER TABLE loading_unloading_configs ADD COLUMN camera_ids TEXT"))
                    conn.commit()
            if "camera_classes" not in existing_cols:
                with engine.connect() as conn:
                    conn.execute(_text("ALTER TABLE loading_unloading_configs ADD COLUMN camera_classes TEXT"))
                    conn.commit()
            if "running_camera_ids" not in existing_cols:
                with engine.connect() as conn:
                    conn.execute(_text("ALTER TABLE loading_unloading_configs ADD COLUMN running_camera_ids TEXT"))
                    conn.commit()
            # Drop columns from abandoned designs (zone drawing + multiple
            # counting modes). The single counting method is now whole-frame
            # visibility-loss, so these are dead. SQLite 3.35+ supports DROP
            # COLUMN; the legacy `camera_id` FK column is intentionally left as a
            # harmless nullable orphan since SQLite can't DROP a FK column without
            # a full table rebuild (fresh installs never create it).
            for dead_col in ("counting_mode", "zone_config"):
                if dead_col in existing_cols:
                    try:
                        with engine.connect() as conn:
                            conn.execute(_text(
                                f"ALTER TABLE loading_unloading_configs DROP COLUMN {dead_col}"
                            ))
                            conn.commit()
                    except Exception:  # pragma: no cover - best-effort cleanup
                        pass
        # Add camera_ids column to tenant_features if missing (online migration).
        if inspector.has_table("tenant_features"):
            feat_cols = {c["name"] for c in inspector.get_columns("tenant_features")}
            if "camera_ids" not in feat_cols:
                with engine.connect() as conn:
                    conn.execute(_text("ALTER TABLE tenant_features ADD COLUMN camera_ids TEXT"))
                    conn.commit()
        if inspector.has_table("people"):
            people_cols = {c["name"] for c in inspector.get_columns("people")}
            if "category" not in people_cols:
                with engine.connect() as conn:
                    conn.execute(_text("ALTER TABLE people ADD COLUMN category VARCHAR(32) NOT NULL DEFAULT 'general'"))
                    conn.commit()
        if inspector.has_table("events"):
            event_cols = {c["name"] for c in inspector.get_columns("events")}
            event_alters = {
                "event_type": "ALTER TABLE events ADD COLUMN event_type VARCHAR(64) NOT NULL DEFAULT 'face_recognition'",
                "feature_type": "ALTER TABLE events ADD COLUMN feature_type VARCHAR(64) NOT NULL DEFAULT 'face_recognition'",
                "object_label": "ALTER TABLE events ADD COLUMN object_label VARCHAR(255)",
                "details_json": "ALTER TABLE events ADD COLUMN details_json TEXT",
            }
            for col, ddl in event_alters.items():
                if col not in event_cols:
                    with engine.connect() as conn:
                        conn.execute(_text(ddl))
                        conn.commit()
        return

    from .config import PROJECT_ROOT  # local import avoids any import cycle

    migrations_dir = PROJECT_ROOT / "migrations"
    if migrations_dir.exists():
        from alembic import command
        from alembic.config import Config as AlembicConfig

        # Build the config programmatically (no .ini file) so env.py skips its
        # fileConfig() call and leaves the host app's loggers untouched.
        alembic_cfg = AlembicConfig()
        alembic_cfg.set_main_option("script_location", str(migrations_dir))
        alembic_cfg.set_main_option("sqlalchemy.url", config.db_url)
        command.upgrade(alembic_cfg, "head")
    else:
        from .models import Base

        Base.metadata.create_all(engine)



@contextmanager
def session_scope(config: AppConfig) -> Iterator[Session]:
    """Transactional session: commits on success, rolls back on error."""
    session = get_session_factory(config)()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
