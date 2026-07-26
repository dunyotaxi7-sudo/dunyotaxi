"""Car types (service tiers) with a fare multiplier + driver class.

Adds a car_types tariff table (seeded econom/komfort/biznes), a car_class on
drivers (which tier a driver serves), and a car_type on rides (which tier the
passenger chose). Fares scale by the tier multiplier; dispatch offers a ride
only to drivers whose car_class matches the ride's car_type.

Revision ID: 0006_car_types
Revises: 0005_commission_fixed
Create Date: 2026-07-25
"""
from __future__ import annotations

from typing import Union

from alembic import op

revision: str = "0006_car_types"
down_revision: Union[str, None] = "0005_commission_fixed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS car_types (
            code        VARCHAR(20) PRIMARY KEY,
            name_uz     VARCHAR(50) NOT NULL,
            multiplier  NUMERIC(4,2) NOT NULL DEFAULT 1.00,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            is_active   BOOLEAN NOT NULL DEFAULT TRUE
        )
        """
    )
    op.execute(
        """
        INSERT INTO car_types (code, name_uz, multiplier, sort_order) VALUES
            ('econom',  'Econom',  1.00, 1),
            ('komfort', 'Komfort', 1.40, 2),
            ('biznes',  'Biznes',  1.80, 3)
        ON CONFLICT (code) DO NOTHING
        """
    )
    # Default everyone to econom so existing rows stay valid.
    op.execute(
        "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS "
        "car_class VARCHAR(20) NOT NULL DEFAULT 'econom'"
    )
    op.execute(
        "ALTER TABLE rides ADD COLUMN IF NOT EXISTS "
        "car_type VARCHAR(20) NOT NULL DEFAULT 'econom'"
    )
    # Referential integrity to the tariff table (named so downgrade can drop).
    op.execute(
        "ALTER TABLE drivers ADD CONSTRAINT drivers_car_class_fkey "
        "FOREIGN KEY (car_class) REFERENCES car_types(code)"
    )
    op.execute(
        "ALTER TABLE rides ADD CONSTRAINT rides_car_type_fkey "
        "FOREIGN KEY (car_type) REFERENCES car_types(code)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_car_type_fkey")
    op.execute("ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_car_class_fkey")
    op.execute("ALTER TABLE rides DROP COLUMN IF EXISTS car_type")
    op.execute("ALTER TABLE drivers DROP COLUMN IF EXISTS car_class")
    op.execute("DROP TABLE IF EXISTS car_types")
