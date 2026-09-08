"""Waiting meter only near the pickup: configurable radius.

The waiting meter charges the passenger, so a driver should not be able to
start it while still far away. ``wait_radius_meters`` is how close to the
pickup point the driver must be before the meter can start. It applies only at
pickup (status ``arrived``); mid-trip waiting is legitimate anywhere.

Revision ID: 0011_wait_radius
Revises: 0010_waiting_charge
Create Date: 2026-09-08
"""
from __future__ import annotations

from typing import Union

from alembic import op

revision: str = "0011_wait_radius"
down_revision: Union[str, None] = "0010_waiting_charge"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE pricing_config "
        "ADD COLUMN IF NOT EXISTS wait_radius_meters INTEGER NOT NULL DEFAULT 200"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE pricing_config DROP COLUMN IF EXISTS wait_radius_meters")
