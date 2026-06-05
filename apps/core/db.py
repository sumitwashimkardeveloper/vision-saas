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
