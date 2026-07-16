"""Block 1: users, drivers, driver_documents."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from geoalchemy2 import Geography
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.common import created_at_col, updated_at_col, uuid_pk


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()
    phone: Mapped[str] = mapped_column(String(13), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(10), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    blocked_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()

    driver: Mapped["Driver | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    car_model: Mapped[str] = mapped_column(String(50), nullable=False)
    car_number: Mapped[str] = mapped_column(String(15), nullable=False)
    car_color: Mapped[str | None] = mapped_column(String(30))
    car_year: Mapped[int | None] = mapped_column(SmallInteger)
    rating: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=Decimal("5.0"))
    total_rides: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(15), default="pending")
    is_online: Mapped[bool] = mapped_column(Boolean, default=False)
    last_known_location: Mapped[object | None] = mapped_column(
        Geography(geometry_type="POINT", srid=4326)
    )
    location_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False)
    )
    created_at: Mapped[datetime] = created_at_col()

    user: Mapped[User] = relationship(back_populates="driver")
    documents: Mapped[list["DriverDocument"]] = relationship(
        back_populates="driver", cascade="all, delete-orphan"
    )


class DriverDocument(Base):
    __tablename__ = "driver_documents"

    id: Mapped[uuid.UUID] = uuid_pk()
    driver_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("drivers.id", ondelete="CASCADE"),
        nullable=False,
    )
    doc_type: Mapped[str] = mapped_column(String(20), nullable=False)
    file_url: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(15), default="pending")
    reject_reason: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))
    uploaded_at: Mapped[datetime] = created_at_col()

    driver: Mapped[Driver] = relationship(back_populates="documents")
