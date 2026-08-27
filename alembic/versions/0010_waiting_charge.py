"""Waiting-time meter: per-ride waiting columns + pricing config.

Adds a driver-controlled waiting meter. On a ride: ``waiting_seconds`` accrues
while the driver waits (at pickup or mid-trip), ``waiting_started_at`` marks a
running meter, and ``waiting_charge`` freezes the final so'm amount at
completion. Pricing gains ``wait_free_minutes`` (free allowance) and
``wait_per_minute`` (charge beyond it) — both admin-controllable.

Revision ID: 0010_waiting_charge
Revises: 0009_commission_combined
Create Date: 2026-08-23
"""
from __future__ import annotations

from typing import Union

from alembic import op

revision: str = "0010_waiting_charge"
down_revision: Union[str, None] = "0009_commission_combined"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE rides ADD COLUMN IF NOT EXISTS waiting_seconds INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE rides ADD COLUMN IF NOT EXISTS waiting_started_at TIMESTAMP")
    op.execute("ALTER TABLE rides ADD COLUMN IF NOT EXISTS waiting_charge INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE pricing_config ADD COLUMN IF NOT EXISTS wait_free_minutes INTEGER NOT NULL DEFAULT 3")
    op.execute("ALTER TABLE pricing_config ADD COLUMN IF NOT EXISTS wait_per_minute INTEGER NOT NULL DEFAULT 1000")


def downgrade() -> None:
    op.execute("ALTER TABLE pricing_config DROP COLUMN IF EXISTS wait_per_minute")
    op.execute("ALTER TABLE pricing_config DROP COLUMN IF EXISTS wait_free_minutes")
    op.execute("ALTER TABLE rides DROP COLUMN IF EXISTS waiting_charge")
    op.execute("ALTER TABLE rides DROP COLUMN IF EXISTS waiting_started_at")
    op.execute("ALTER TABLE rides DROP COLUMN IF EXISTS waiting_seconds")
