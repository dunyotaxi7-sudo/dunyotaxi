"""service_areas table (allowed operating region) + GIST index.

Revision ID: 0002_service_areas
Revises: 0001_initial_schema
Create Date: 2026-07-13
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0002_service_areas"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS service_areas (
            id          SERIAL PRIMARY KEY,
            name        VARCHAR(100) NOT NULL,
            geom        GEOGRAPHY(GEOMETRY, 4326) NOT NULL,
            is_active   BOOLEAN DEFAULT TRUE,
            updated_by  UUID REFERENCES users(id),
            updated_at  TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_service_areas_geom
            ON service_areas USING GIST (geom);
        CREATE INDEX IF NOT EXISTS idx_service_areas_active
            ON service_areas (is_active) WHERE is_active = TRUE;
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS service_areas CASCADE")
