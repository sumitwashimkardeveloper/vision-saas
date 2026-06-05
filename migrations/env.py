"""Alembic environment.

The DB URL comes from configs/app.yaml via our AppConfig, unless a caller
overrides it with ``-x sqlalchemy.url=...`` or sets it on the Alembic config
(as scripts/init_db.py does). target_metadata = our models' Base.metadata so
``--autogenerate`` works.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from apps.core.config import load_config
from apps.core.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Resolve the URL: explicit override wins, else fall back to app config.
if not config.get_main_option("sqlalchemy.url"):
    config.set_main_option("sqlalchemy.url", load_config().db_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=True,  # batch mode = ALTER support on SQLite
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
