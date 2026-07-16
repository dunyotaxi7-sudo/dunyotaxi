"""Block 3: pricing_config, commission_config, driver_commissions, wallets,
wallet_transactions."""
from __future__ import annotations

import uuid
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Time,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.common import created_at_col, updated_at_col, uuid_pk


class PricingConfig(Base):
    __tablename__ = "pricing_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    base_fare: Mapped[int] = mapped_column(Integer, default=10000)
    base_km: Mapped[Decimal] = mapped_column(Numeric(4, 1), default=Decimal("2.0"))
    price_per_km: Mapped[int] = mapped_column(Integer, default=2500)
    min_price: Mapped[int] = mapped_column(Integer, default=10000)
    night_multiplier: Mapped[Decimal] = mapped_column(
        Numeric(3, 2), default=Decimal("1.20")
    )
    night_start: Mapped[time] = mapped_column(Time, default=time(22, 0))
    night_end: Mapped[time] = mapped_column(Time, default=time(6, 0))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id")
    )
    updated_at: Mapped[datetime] = updated_at_col()


class CommissionConfig(Base):
    __tablename__ = "commission_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    driver_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("drivers.id", ondelete="CASCADE")
    )
    commission_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("15.00")
    )
    valid_from: Mapped[date] = mapped_column(
        Date, nullable=False, server_default=text("CURRENT_DATE")
    )
    valid_until: Mapped[date | None] = mapped_column(Date)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped[datetime] = created_at_col()


class DriverCommission(Base):
    __tablename__ = "driver_commissions"

    id: Mapped[uuid.UUID] = uuid_pk()
    ride_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("rides.id"), unique=True, nullable=False
    )
    driver_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("drivers.id"), nullable=False
    )
    ride_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    commission_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    commission_sum: Mapped[int] = mapped_column(Integer, nullable=False)
    driver_earning: Mapped[int] = mapped_column(Integer, nullable=False)
    settled: Mapped[bool] = mapped_column(Boolean, default=False)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))
    created_at: Mapped[datetime] = created_at_col()


class Wallet(Base):
    __tablename__ = "wallets"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False
    )
    balance: Mapped[int] = mapped_column(Integer, default=0)
    total_earned: Mapped[int] = mapped_column(Integer, default=0)
    total_withdrawn: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = updated_at_col()


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    id: Mapped[uuid.UUID] = uuid_pk()
    wallet_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("wallets.id"), nullable=False
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    tx_type: Mapped[str] = mapped_column(String(30), nullable=False)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    description: Mapped[str | None] = mapped_column(String(200))
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = created_at_col()
