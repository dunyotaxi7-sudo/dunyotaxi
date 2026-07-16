"""Driver service: registration, documents, online/offline state."""
from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path

import redis.asyncio as redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Driver, DriverDocument, User
from app.services import location

# Shared document-file storage (used by the driver upload endpoint and the
# admin panel upload). Files land under uploads/<driver_id>/ and are served
# statically at /uploads/...
UPLOAD_ROOT = Path("uploads")
ALLOWED_DOC_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".pdf"}
MAX_DOC_BYTES = 10 * 1024 * 1024  # 10 MB

# Documents a driver must upload: their passport, the car's tech/tax passport,
# and two car photos. (license/inspection are legacy — still accepted from old
# records but no longer requested.)
DOC_TYPES = {"passport", "tech_passport", "car_photo_front", "car_photo_back"}


class DriverError(Exception):
    pass


async def get_driver_by_user(db: AsyncSession, user_id: uuid.UUID) -> Driver | None:
    res = await db.execute(select(Driver).where(Driver.user_id == user_id))
    return res.scalar_one_or_none()


async def register_driver(db: AsyncSession, user: User, payload) -> Driver:
    if user.role == "passenger":
        # Promote a passenger account to driver on first registration.
        # Never touch an admin — that would silently revoke their panel access.
        user.role = "driver"

    existing = await get_driver_by_user(db, user.id)
    if existing is not None:
        raise DriverError("driver profile already exists")

    driver = Driver(
        user_id=user.id,
        car_model=payload.car_model,
        car_number=payload.car_number,
        car_color=payload.car_color,
        car_year=payload.car_year,
        status="pending",
    )
    db.add(driver)
    await db.commit()
    await db.refresh(driver)
    return driver


async def store_document(
    db: AsyncSession, driver: Driver, doc_type: str, filename: str | None, data: bytes
) -> DriverDocument:
    """Validate + save an uploaded document file and record it (status pending).
    Shared by the driver app upload and the admin-panel upload."""
    if doc_type not in DOC_TYPES:
        raise DriverError(f"invalid doc_type: {doc_type}")
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_DOC_EXT:
        raise DriverError(f"unsupported file type: {ext}")
    if len(data) > MAX_DOC_BYTES:
        raise DriverError("file too large")

    dest_dir = UPLOAD_ROOT / str(driver.id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    fname = f"{doc_type}_{uuid.uuid4().hex}{ext}"
    (dest_dir / fname).write_bytes(data)

    doc = DriverDocument(
        driver_id=driver.id,
        doc_type=doc_type,
        file_url=f"/uploads/{driver.id}/{fname}",
        status="pending",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


async def add_document(db: AsyncSession, driver: Driver, payload) -> DriverDocument:
    if payload.doc_type not in DOC_TYPES:
        raise DriverError(f"invalid doc_type: {payload.doc_type}")
    doc = DriverDocument(
        driver_id=driver.id,
        doc_type=payload.doc_type,
        file_url=payload.file_url,
        status="pending",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


async def set_online(
    db: AsyncSession, r: redis.Redis, driver: Driver, online: bool,
    lat: float | None = None, lng: float | None = None,
) -> Driver:
    """Toggle availability. Approved drivers only may go online."""
    if online and driver.status != "approved":
        raise DriverError("driver is not approved")

    driver.is_online = online
    if online and lat is not None and lng is not None:
        await location.set_location(r, str(driver.id), lat, lng)
        driver.last_known_location = f"SRID=4326;POINT({lng} {lat})"
        driver.location_updated_at = datetime.now()
    elif not online:
        await location.remove_driver(r, str(driver.id))

    await db.commit()
    await db.refresh(driver)
    return driver


async def persist_last_location(
    db: AsyncSession, driver_id: uuid.UUID, lat: float, lng: float
) -> None:
    """Write the last-known point to PostGIS (called periodically / on disconnect)."""
    driver = await db.get(Driver, driver_id)
    if driver is None:
        return
    driver.last_known_location = f"SRID=4326;POINT({lng} {lat})"
    driver.location_updated_at = datetime.now()
    await db.commit()
