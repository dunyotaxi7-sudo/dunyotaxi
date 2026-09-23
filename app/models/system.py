"""Block 5: notifications, admin_audit_logs, saved places."""
from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.common import created_at_col, updated_at_col, uuid_pk


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    channel: Mapped[str] = mapped_column(String(10), nullable=False)
    category: Mapped[str | None] = mapped_column(String(20))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    is_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))
    created_at: Mapped[datetime] = created_at_col()


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id: Mapped[uuid.UUID] = uuid_pk()
    admin_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(30))
    entity_id: Mapped[str | None] = mapped_column(String(50))
    old_value: Mapped[dict | None] = mapped_column(JSONB)
    new_value: Mapped[dict | None] = mapped_column(JSONB)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = created_at_col()


class ServiceArea(Base):
    """Allowed operating region boundary (e.g. Buxoro viloyati). Point-in-area
    checks use ST_Covers against ``geom``; the backend also caches it in memory."""

    __tablename__ = "service_areas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    geom: Mapped[object] = mapped_column(
        Geography(geometry_type="GEOMETRY", srid=4326), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id")
    )
    updated_at: Mapped[datetime] = updated_at_col()


class Place(Base):
    """A landmark an operator can pick instead of hunting for it on the map.

    Callers in Bukhara name places, not streets — "Sitorai Mohi Xosa", a
    mahalla gate, a clinic — and the address search frequently does not know
    them, so the operator ends up guessing at a pin. A saved place is an exact
    point under the name the caller actually says.

    Deliberately not referenced by rides: the ride copies the name into
    ``from_address``/``to_address``, so renaming or deleting a place later
    cannot rewrite the history of trips already taken under the old name.
    """

    __tablename__ = "places"

    id: Mapped[uuid.UUID] = uuid_pk()
    # What the caller says, and what the driver is shown.
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # The street this resolved to when it was pinned. For the operator's eyes —
    # it disambiguates two places with similar names in the picker.
    address: Mapped[str | None] = mapped_column(String(200))
    location: Mapped[object] = mapped_column(
        Geography(geometry_type="POINT", srid=4326), nullable=False
    )
    # Retired rather than deleted, when a place closes but its name should stop
    # being offered.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()
