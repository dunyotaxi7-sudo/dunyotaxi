"""Allow 'deposit' and 'adjustment' wallet transaction types (admin-managed
driver balance).

Revision ID: 0003_wallet_tx_deposit
Revises: 0002_service_areas
Create Date: 2026-07-14
"""
from __future__ import annotations

from typing import Union

from alembic import op

revision: str = "0003_wallet_tx_deposit"
down_revision: Union[str, None] = "0002_service_areas"
branch_labels = None
depends_on = None

_CONSTRAINT = "wallet_transactions_tx_type_check"
_TABLE = "wallet_transactions"

_NEW = (
    "'ride_earning','commission','bonus','promo','withdrawal','refund',"
    "'deposit','adjustment'"
)
_OLD = "'ride_earning','commission','bonus','promo','withdrawal','refund'"


def upgrade() -> None:
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="check")
    op.create_check_constraint(_CONSTRAINT, _TABLE, f"tx_type IN ({_NEW})")


def downgrade() -> None:
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="check")
    op.create_check_constraint(_CONSTRAINT, _TABLE, f"tx_type IN ({_OLD})")
