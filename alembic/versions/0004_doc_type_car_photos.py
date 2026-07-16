"""Add 'car_photo_front' / 'car_photo_back' driver document types.

Revision ID: 0004_doc_type_car_photos
Revises: 0003_wallet_tx_deposit
Create Date: 2026-07-14
"""
from __future__ import annotations

from typing import Union

from alembic import op

revision: str = "0004_doc_type_car_photos"
down_revision: Union[str, None] = "0003_wallet_tx_deposit"
branch_labels = None
depends_on = None

_CONSTRAINT = "driver_documents_doc_type_check"
_TABLE = "driver_documents"

_NEW = (
    "'passport','license','tech_passport','inspection',"
    "'car_photo_front','car_photo_back'"
)
_OLD = "'passport','license','tech_passport','inspection'"


def upgrade() -> None:
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="check")
    op.create_check_constraint(_CONSTRAINT, _TABLE, f"doc_type IN ({_NEW})")


def downgrade() -> None:
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="check")
    op.create_check_constraint(_CONSTRAINT, _TABLE, f"doc_type IN ({_OLD})")
