"""Saved places: named points an operator picks instead of hunting on the map.

Callers name landmarks rather than streets, and the address search often does
not know the local ones, so the operator ends up approximating a pin. A saved
place is an exact point stored under the name people actually say.

The name is unique case-insensitively: every operator can add places, and the
failure mode of that is three spellings of one bazaar rather than too few
entries. A clear 409 at the moment of saving is cheaper than cleaning up
duplicates later.

Rides deliberately do not reference this table — they copy the name into
``from_address``, so editing or deleting a place never rewrites the history of
trips already taken under the old name.

Revision ID: 0013_places
Revises: 0012_metered_fare
Create Date: 2026-09-23
"""
from __future__ import annotations

from typing import Union

from alembic import op

revision: str = "0013_places"
down_revision: Union[str, None] = "0012_metered_fare"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS places (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(120) NOT NULL,
            address VARCHAR(200),
            location GEOGRAPHY(POINT, 4326) NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by UUID REFERENCES users(id),
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS places_name_lower_uniq "
        "ON places (LOWER(name))"
    )
    # The picker searches by name on every keystroke; this keeps the prefix
    # match off a sequential scan as the list grows.
    op.execute(
        "CREATE INDEX IF NOT EXISTS places_name_lower_idx ON places (LOWER(name))"
    )
    # "What is saved near this pin?" — used when offering an operator the
    # places around the point they just clicked.
    op.execute(
        "CREATE INDEX IF NOT EXISTS places_location_gix ON places USING GIST (location)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS places")
