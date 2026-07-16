"""Block 4: bonus_campaigns, bonus_achievements, promo_codes, promo_usages."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.common import created_at_col, uuid_pk


class BonusCampaign(Base):
    __tablename__ = "bonus_campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    bonus_type: Mapped[str] = mapped_column(String(30), nullable=False)
    target_value: Mapped[int | None] = mapped_column(Integer)
    bonus_amount: Mapped[int | None] = mapped_column(Integer)
    bonus_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    applies_to: Mapped[str] = mapped_column(String(10), default="driver")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped[datetime] = created_at_col()


class BonusAchievement(Base):
    __tablename__ = "bonus_achievements"
    __table_args__ = (UniqueConstraint("campaign_id", "user_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    campaign_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("bonus_campaigns.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    progress: Mapped[int] = mapped_column(Integer, default=0)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))
    bonus_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    bonus_paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))
    created_at: Mapped[datetime] = created_at_col()


class PromoCode(Base):
    __tablename__ = "promo_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    discount_type: Mapped[str] = mapped_column(String(10), nullable=False)
    discount_value: Mapped[int] = mapped_column(Integer, nullable=False)
    max_discount: Mapped[int | None] = mapped_column(Integer)
    min_ride_price: Mapped[int] = mapped_column(Integer, default=0)
    usage_limit: Mapped[int | None] = mapped_column(Integer)
    used_count: Mapped[int] = mapped_column(Integer, default=0)
    per_user_limit: Mapped[int] = mapped_column(Integer, default=1)
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_until: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = created_at_col()


class PromoUsage(Base):
    __tablename__ = "promo_usages"

    id: Mapped[uuid.UUID] = uuid_pk()
    promo_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("promo_codes.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    ride_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("rides.id")
    )
    discount_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    used_at: Mapped[datetime] = created_at_col()
