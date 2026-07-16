"""Alembic environment — runs migrations with a SYNC engine derived from the
app's async DATABASE_URL.

Note: the three DB triggers (rating update, ride-completion commission, bonus
payout) and the PostGIS / uuid-ossp extensions are created by the source
schema (buxoro_taxi_schema.sql). Autogenerate manages the *tables* only; keep
triggers in a hand-written migration or apply the original SQL once.
"""
from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from geoalchemy2 import alembic_helpers
from sqlalchemy import create_engine, pool

from app.core.config import settings
from app.core.database import Base

# Import models so their metadata is registered on Base.
import app.models  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _exclude_postgis(obj, name, type_, reflected, compare_to):
    """Don't let autogenerate try to drop PostGIS' internal objects."""
    if type_ == "table" and name in {"spatial_ref_sys"}:
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=settings.sync_database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=_exclude_postgis,
        render_item=alembic_helpers.render_item,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(settings.sync_database_url, poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=_exclude_postgis,
            process_revision_directives=alembic_helpers.writer,
            render_item=alembic_helpers.render_item,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
