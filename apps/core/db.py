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
