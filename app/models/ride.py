"""Block 2: rides, payments, ratings."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from geoalchemy2 import Geography
from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.common import created_at_col, uuid_pk


class Ride(Base):
    __tablename__ = "rides"

    id: Mapped[uuid.UUID] = uuid_pk()
    passenger_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    driver_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("drivers.id")
    )

    from_location: Mapped[object] = mapped_column(
        Geography(geometry_type="POINT", srid=4326), nullable=False
    )
    to_location: Mapped[object] = mapped_column(
        Geography(geometry_type="POINT", srid=4326), nullable=False
    )
    from_address: Mapped[str] = mapped_column(String(200), nullable=False)
    to_address: Mapped[str] = mapped_column(String(200), nullable=False)

    distance_km: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    duration_min: Mapped[int | None] = mapped_column(SmallInteger)
    price_sum: Mapped[int | None] = mapped_column(Integer)

    status: Mapped[str] = mapped_column(String(20), default="searching")
    cancelled_by: Mapped[str | None] = mapped_column(String(10))
    cancel_reason: Mapped[str | None] = mapped_column(Text)

    payment_method: Mapped[str] = mapped_column(String(20), default="cash")

    created_at: Mapped[datetime] = created_at_col()
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))

    payment: Mapped["Payment | None"] = relationship(
        back_populates="ride", uselist=False
    )


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = uuid_pk()
    ride_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("rides.id"), unique=True, nullable=False
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False, default="cash")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    external_id: Mapped[str | None] = mapped_column(String(100))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))
    created_at: Mapped[datetime] = created_at_col()

    ride: Mapped[Ride] = relationship(back_populates="payment")


class Rating(Base):
    __tablename__ = "ratings"
    __table_args__ = (UniqueConstraint("ride_id", "from_user_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    ride_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("rides.id"), nullable=False
    )
    from_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    to_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_col()
