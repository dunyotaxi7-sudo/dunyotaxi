"""Metered rides: a pickup with no destination, priced by distance driven.

Callers often want "just drive, I'll direct him" — there is no destination to
quote against, so the fare comes from the kilometres actually covered instead
of an estimate made up front.

Three changes:

  * ``fare_mode`` marks which kind of ride this is. Existing rides are all
    'fixed' and keep behaving exactly as before; nothing about the current
    flow changes.
  * ``to_location`` / ``to_address`` become nullable, because a metered ride
    genuinely has no destination when it is created. They are still required
    for fixed rides — enforced in the application, since one column cannot be
    conditionally NOT NULL.
  * ``metered_km`` accumulates the distance the server measures from the
    driver's GPS stream while the trip is ongoing. Deliberately separate from
    ``distance_km`` (the up-front estimate) so the two are never confused:
    one is what we guessed, the other is what happened.

Revision ID: 0012_metered_fare
Revises: 0011_wait_radius
Create Date: 2026-09-20
"""
from __future__ import annotations

from typing import Union

from alembic import op

revision: str = "0012_metered_fare"
down_revision: Union[str, None] = "0011_wait_radius"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE rides "
        "ADD COLUMN IF NOT EXISTS fare_mode VARCHAR(10) NOT NULL DEFAULT 'fixed'"
    )
    # Named so it can be dropped again; CHECK keeps the two modes honest.
    op.execute(
        "ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_fare_mode_check"
    )
    op.execute(
        "ALTER TABLE rides ADD CONSTRAINT rides_fare_mode_check "
        "CHECK (fare_mode IN ('fixed', 'meter'))"
    )
    op.execute(
        "ALTER TABLE rides "
        "ADD COLUMN IF NOT EXISTS metered_km NUMERIC(6,2) NOT NULL DEFAULT 0"
    )
    # A metered ride has no destination at creation.
    op.execute("ALTER TABLE rides ALTER COLUMN to_location DROP NOT NULL")
    op.execute("ALTER TABLE rides ALTER COLUMN to_address DROP NOT NULL")


def downgrade() -> None:
    # Only safe while no metered ride exists — a metered ride has no
    # destination, so restoring NOT NULL would fail on its NULLs. Deliberately
    # left to fail loudly rather than inventing a destination for it.
    op.execute("ALTER TABLE rides ALTER COLUMN to_address SET NOT NULL")
    op.execute("ALTER TABLE rides ALTER COLUMN to_location SET NOT NULL")
    op.execute("ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_fare_mode_check")
    op.execute("ALTER TABLE rides DROP COLUMN IF EXISTS metered_km")
    op.execute("ALTER TABLE rides DROP COLUMN IF EXISTS fare_mode")
