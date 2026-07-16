"""Driver router: registration, documents, online/offline status."""
from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path

import redis.asyncio as redis
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel

from app.api.deps import get_current_driver, get_current_user, get_redis_dep
from app.core.database import get_db
from app.models import Driver, DriverCommission, DriverDocument, Ride, User
from app.schemas.driver import (
    DocumentPublic,
    DocumentUpload,
    DriverBonus,
    DriverEarnings,
    DriverPublic,
    DriverRegister,
    DriverRideHistory,
    DriverStatusUpdate,
    DriverTodayStats,
    DriverWalletView,
    RideEarningBreakdown,
    WalletTx,
)
from app.services import driver as driver_service
from app.services import driver_finance
from app.services import ride as ride_service

router = APIRouter(prefix="/driver", tags=["driver"])

# Local file storage for uploaded documents (served statically at /uploads).
UPLOAD_ROOT = Path("uploads")
_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".pdf"}
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/register", response_model=DriverPublic, status_code=201)
async def register(
    payload: DriverRegister,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        driver = await driver_service.register_driver(db, user, payload)
    except driver_service.DriverError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return DriverPublic.model_validate(driver)


@router.get("/me", response_model=DriverPublic)
async def my_profile(driver: Driver = Depends(get_current_driver)):
    return DriverPublic.model_validate(driver)


@router.post("/documents", response_model=DocumentPublic, status_code=201)
async def upload_document(
    payload: DocumentUpload,
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    try:
        doc = await driver_service.add_document(db, driver, payload)
    except driver_service.DriverError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return DocumentPublic.model_validate(doc)


@router.post("/documents/upload", response_model=DocumentPublic, status_code=201)
async def upload_document(
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """Accept a document photo, store it, and record the DriverDocument.

    Files are saved under ``uploads/<driver_id>/`` and served at ``/uploads/...``.
    """
    if doc_type not in driver_service.DOC_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"invalid doc_type: {doc_type}")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unsupported file type: {ext}")

    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "file too large")

    dest_dir = UPLOAD_ROOT / str(driver.id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{doc_type}_{uuid.uuid4().hex}{ext}"
    (dest_dir / filename).write_bytes(data)
    file_url = f"/uploads/{driver.id}/{filename}"

    payload = DocumentUpload(doc_type=doc_type, file_url=file_url)
    doc = await driver_service.add_document(db, driver, payload)
    return DocumentPublic.model_validate(doc)


@router.get("/documents", response_model=list[DocumentPublic])
async def my_documents(
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(DriverDocument).where(DriverDocument.driver_id == driver.id)
    )
    return [DocumentPublic.model_validate(d) for d in res.scalars()]


@router.get("/stats/today", response_model=DriverTodayStats)
async def today_stats(
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """Completed rides + net earnings for the driver since midnight."""
    start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    rides_completed = int((await db.execute(
        select(func.count()).select_from(Ride).where(
            Ride.driver_id == driver.id,
            Ride.status == "completed",
            Ride.completed_at >= start,
        )
    )).scalar() or 0)

    earnings = int((await db.execute(
        select(func.coalesce(func.sum(DriverCommission.driver_earning), 0)).where(
            DriverCommission.driver_id == driver.id,
            DriverCommission.created_at >= start,
        )
    )).scalar() or 0)

    return DriverTodayStats(
        rides_completed=rides_completed,
        earnings_sum=earnings,
        is_online=driver.is_online,
    )


# ── Finance (earnings, wallet, history) ───────────────────────────────


@router.get("/earnings", response_model=DriverEarnings)
async def earnings(
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    return await driver_finance.earnings(db, driver)


@router.get("/wallet", response_model=DriverWalletView)
async def wallet(
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    return await driver_finance.wallet_view(db, driver)


@router.get("/wallet/transactions", response_model=list[WalletTx])
async def wallet_transactions(
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
    limit: int = 100,
):
    return await driver_finance.transactions(db, driver, limit)


@router.get("/rides", response_model=list[DriverRideHistory])
async def ride_history(
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
):
    return await driver_finance.ride_history(db, driver, limit)


@router.get("/bonuses", response_model=list[DriverBonus])
async def bonuses(
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    return await driver_finance.bonuses(db, driver)


@router.get("/rides/{ride_id}/earning", response_model=RideEarningBreakdown)
async def ride_earning(
    ride_id: uuid.UUID,
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    data = await driver_finance.ride_earning(db, driver, ride_id)
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no earning record for this ride")
    return data


class LocationIn(BaseModel):
    lat: float
    lng: float


@router.post("/location", status_code=204)
async def update_location(
    payload: LocationIn,
    driver: Driver = Depends(get_current_driver),
    r: redis.Redis = Depends(get_redis_dep),
):
    """HTTP location update — used for background streaming (where holding a
    WebSocket open isn't reliable). Same effect as the location WS."""
    await ride_service.relay_driver_location(r, str(driver.id), payload.lat, payload.lng)


@router.get("/pending-offer")
async def pending_offer(driver: Driver = Depends(get_current_driver)):
    """The ride currently being offered to this driver, if any. Lets a
    backgrounded/relaunched app recover an offer it missed on the socket."""
    ride_id = ride_service.pending_offer_for_driver(str(driver.id))
    return {"ride_id": ride_id}


@router.get("/current-ride")
async def current_ride(
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """The driver's in-progress ride (accepted/arrived/ongoing), if any. Lets the
    app pick up an admin force-assigned order and recover after a restart."""
    row = (await db.execute(
        select(Ride.id, Ride.status)
        .where(
            Ride.driver_id == driver.id,
            Ride.status.in_(["accepted", "arrived", "ongoing"]),
        )
        .order_by(Ride.accepted_at.desc())
        .limit(1)
    )).first()
    if row is None:
        return {"ride_id": None, "status": None}
    return {"ride_id": str(row.id), "status": row.status}


@router.patch("/status", response_model=DriverPublic)
async def set_status(
    payload: DriverStatusUpdate,
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
    r: redis.Redis = Depends(get_redis_dep),
):
    try:
        driver = await driver_service.set_online(db, r, driver, payload.is_online)
    except driver_service.DriverError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return DriverPublic.model_validate(driver)
