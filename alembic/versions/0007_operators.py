"""Operator staff role: username/password login + granular permissions.

Operators are users with role='operator' who sign in to the admin panel with a
username + password (not phone/OTP) and hold a JSON set of permission flags an
admin toggles. Their actions log through the existing admin_audit_logs.

Revision ID: 0007_operators
Revises: 0006_car_types
Create Date: 2026-07-26
"""
from __future__ import annotations

from typing import Union

from alembic import op

revision: str = "0007_operators"
down_revision: Union[str, None] = "0006_car_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Allow the new role. VARCHAR(10) already fits 'operator'.
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check")
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT users_role_check "
        "CHECK (role IN ('passenger', 'driver', 'admin', 'operator'))"
    )
    # Operators authenticate by username, not phone, so phone becomes optional.
    # The unique index on phone still holds — Postgres treats NULLs as distinct.
    op.execute("ALTER TABLE users ALTER COLUMN phone DROP NOT NULL")
    # Operator credentials + permissions (all NULL for non-operators).
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username "
        "ON users(username) WHERE username IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_users_username")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS permissions")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS password_hash")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS username")
    # Restore NOT NULL (fails if any operator rows with NULL phone remain).
    op.execute("ALTER TABLE users ALTER COLUMN phone SET NOT NULL")
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check")
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT users_role_check "
        "CHECK (role IN ('passenger', 'driver', 'admin'))"
    )
