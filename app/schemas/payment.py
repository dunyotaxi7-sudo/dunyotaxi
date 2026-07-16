"""Payment schemas."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class PaymentCreate(BaseModel):
    method: str = Field(default="cash", description="cash|payme|click|uzum|wallet")
    external_id: str | None = Field(default=None, max_length=100)


class PaymentPublic(ORMModel):
    id: uuid.UUID
    ride_id: uuid.UUID
    amount: int
    method: str
    status: str
    external_id: str | None = None
    paid_at: datetime | None = None
    created_at: datetime | None = None
