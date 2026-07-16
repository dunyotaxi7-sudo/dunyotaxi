"""Admin router: moderation, live map, config CRUD, stats. All actions audited."""
from __future__ import annotations

import uuid
from datetime import datetime

import redis.asyncio as redis
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import client_ip, get_redis_dep, require_role
from app.core.database import get_db
from app.models import (
    BonusCampaign,
    CommissionConfig,
    Driver,
    DriverDocument,
    PricingConfig,
    PromoCode,
    User,
)
from app.schemas.admin import (
    AdminDriverCreate,
    AdminDriverProfileUpdate,
    AdminDriverRow,
    AdminOrderCreate,
    AdminOrderOut,
    AdminPassengerCreate,
    AuditLogPublic,
    DriverBalanceOut,
    DriverBalanceUpdate,
    DriverTxRow,
    LiveRideRow,
    BonusCampaignCreate,
    BonusCampaignPublic,
    BonusCampaignUpdate,
    CommissionConfigCreate,
    CommissionConfigPublic,
    AdminRideDetail,
    AdminRideRow,
    DailyStat,
    DocumentReview,
    DriverModeration,
    PassengerDetail,
    PassengerRow,
    PassengerUpdate,
    PricingConfigCreate,
    PricingConfigPublic,
    PricingConfigUpdate,
    PromoCodeCreate,
    PromoCodePublic,
    PromoCodeUpdate,
    ServiceAreaOut,
    ServiceAreaUpdate,
    UserLookup,
    StatsResponse,
    UserBlock,
)
from app.schemas.driver import DocumentPublic, DriverPublic, OnlineDriver
from app.schemas.ride import RidePublic
from app.models import AdminAuditLog, Ride
from app.services import admin as admin_service
from app.services import driver as driver_service
from app.services import location
from app.services import service_area

router = APIRouter(
    prefix="/admin", tags=["admin"], dependencies=[Depends(require_role("admin"))]
)


# ── Driver management ─────────────────────────────────────────────────


@router.get("/drivers", response_model=list[AdminDriverRow])
async def list_drivers(
    db: AsyncSession = Depends(get_db),
    status_filter: str | None = None,
):
    rows = await admin_service.list_drivers_with_balance(db, status_filter)
    return [AdminDriverRow(**r) for r in rows]


@router.post("/drivers", response_model=AdminDriverRow, status_code=201)
async def create_driver(
    payload: AdminDriverCreate,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Create a driver (user + car profile) directly from the admin panel."""
    try:
        result = await admin_service.create_driver(
            db, admin.id, payload, client_ip(request)
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return AdminDriverRow(**result)


@router.patch("/drivers/{driver_id}/profile", response_model=AdminDriverRow)
async def update_driver_profile(
    driver_id: uuid.UUID,
    payload: AdminDriverProfileUpdate,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Edit a driver's name and car details."""
    try:
        result = await admin_service.update_driver_profile(
            db, admin.id, driver_id, payload, client_ip(request)
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return AdminDriverRow(**result)


@router.get("/drivers/{driver_id}/transactions", response_model=list[DriverTxRow])
async def driver_transactions(
    driver_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    limit: int = 100,
):
    """A driver's wallet history (commission per ride, deposits, etc.)."""
    rows = await admin_service.driver_transactions(db, driver_id, max(1, min(limit, 500)))
    return [DriverTxRow(**r) for r in rows]


@router.post("/drivers/{driver_id}/balance", response_model=DriverBalanceOut)
async def adjust_driver_balance(
    driver_id: uuid.UUID,
    payload: DriverBalanceUpdate,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Deposit to (or deduct from) a driver's wallet balance."""
    try:
        result = await admin_service.adjust_driver_balance(
            db, admin.id, driver_id, payload.amount, payload.note, client_ip(request)
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return DriverBalanceOut(**result)


@router.get("/drivers/{driver_id}/documents", response_model=list[DocumentPublic])
async def driver_documents(
    driver_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(DriverDocument).where(DriverDocument.driver_id == driver_id)
    )
    return [DocumentPublic.model_validate(d) for d in res.scalars()]


@router.post(
    "/drivers/{driver_id}/documents",
    response_model=DocumentPublic,
    status_code=201,
)
async def upload_driver_document(
    driver_id: uuid.UUID,
    request: Request,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Upload a document for a driver on their behalf (admin panel)."""
    driver = await db.get(Driver, driver_id)
    if driver is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "driver not found")
    data = await file.read()
    try:
        doc = await driver_service.store_document(
            db, driver, doc_type, file.filename, data
        )
    except driver_service.DriverError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    await admin_service.log_action(
        db, admin.id, "document_upload", entity_type="driver",
        entity_id=str(driver_id), new_value={"doc_type": doc_type},
        ip_address=client_ip(request),
    )
    await db.commit()
    return DocumentPublic.model_validate(doc)


@router.patch("/drivers/{driver_id}", response_model=DriverPublic)
async def moderate_driver(
    driver_id: uuid.UUID,
    payload: DriverModeration,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    if payload.status not in {"pending", "approved", "rejected", "suspended"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid status")
    try:
        driver = await admin_service.moderate_driver(
            db, admin.id, driver_id, payload.status, payload.reason,
            client_ip(request),
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    return DriverPublic.model_validate(driver)


@router.patch("/documents/{doc_id}", response_model=DocumentPublic)
async def review_document(
    doc_id: uuid.UUID,
    payload: DocumentReview,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    if payload.status not in {"approved", "rejected"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid status")
    try:
        doc = await admin_service.review_document(
            db, admin.id, doc_id, payload.status, payload.reject_reason,
            client_ip(request),
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    return DocumentPublic.model_validate(doc)


@router.patch("/users/{user_id}/block", response_model=dict)
async def block_user(
    user_id: uuid.UUID,
    payload: UserBlock,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    try:
        user = await admin_service.block_user(
            db, admin.id, user_id, payload.is_blocked, payload.reason,
            client_ip(request),
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    return {"id": str(user.id), "is_blocked": user.is_blocked}


# ── Passengers ────────────────────────────────────────────────────────


@router.get("/passengers", response_model=list[PassengerRow])
async def list_passengers(
    db: AsyncSession = Depends(get_db),
    search: str | None = None,
):
    rows = await admin_service.list_passengers(db, search)
    return [PassengerRow(**r) for r in rows]


@router.get("/users/by-phone", response_model=UserLookup)
async def user_by_phone(
    phone: str,
    db: AsyncSession = Depends(get_db),
):
    """Look up a user by phone (for the order form's auto-fill)."""
    return UserLookup(**await admin_service.lookup_user_by_phone(db, phone))


@router.post("/passengers", response_model=PassengerDetail, status_code=201)
async def create_passenger(
    payload: AdminPassengerCreate,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Create a passenger (client) directly from the admin panel."""
    try:
        result = await admin_service.create_passenger(
            db, admin.id, payload, client_ip(request)
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return PassengerDetail(**result)


@router.get("/passengers/{user_id}", response_model=PassengerDetail)
async def passenger_detail(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    data = await admin_service.passenger_detail(db, user_id)
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "passenger not found")
    return PassengerDetail(**data)


@router.patch("/passengers/{user_id}", response_model=PassengerDetail)
async def update_passenger(
    user_id: uuid.UUID,
    payload: PassengerUpdate,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Edit a passenger's name and/or phone."""
    try:
        result = await admin_service.update_passenger(
            db, admin.id, user_id, payload, client_ip(request)
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return PassengerDetail(**result)


@router.get("/passengers/{user_id}/rides", response_model=list[RidePublic])
async def passenger_rides(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
):
    res = await db.execute(
        select(Ride).where(Ride.passenger_id == user_id)
        .order_by(Ride.created_at.desc()).limit(limit)
    )
    return [RidePublic.model_validate(r) for r in res.scalars()]


# ── Service area ──────────────────────────────────────────────────────


@router.get("/service-area", response_model=ServiceAreaOut)
async def get_service_area(db: AsyncSession = Depends(get_db)):
    data = await admin_service.get_service_area(db)
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no service area configured")
    return ServiceAreaOut(**data)


@router.put("/service-area", response_model=ServiceAreaOut)
async def update_service_area(
    payload: ServiceAreaUpdate,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    try:
        await admin_service.update_service_area(
            db, admin.id, payload.name, payload.geojson, client_ip(request)
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    # Refresh the in-memory cache so the guard uses the new boundary immediately.
    await service_area.reload(db)
    data = await admin_service.get_service_area(db)
    return ServiceAreaOut(**data)


# ── Orders (manual admin dispatch) ────────────────────────────────────


@router.post("/orders", response_model=AdminOrderOut, status_code=201)
async def create_order(
    payload: AdminOrderCreate,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Create a ride for a passenger (by phone) and connect it to a driver —
    auto (nearest), offer (chosen driver first, then fall back), or force-assign."""
    try:
        result = await admin_service.create_order(
            db, admin.id, payload, client_ip(request)
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return AdminOrderOut(**result)


# ── Rides ─────────────────────────────────────────────────────────────


@router.get("/rides/live", response_model=list[LiveRideRow])
async def live_rides(db: AsyncSession = Depends(get_db)):
    """Active orders (searching/accepted/arrived/ongoing) for the live board."""
    rows = await admin_service.list_live_rides(db)
    return [LiveRideRow(**r) for r in rows]


@router.get("/rides", response_model=list[AdminRideRow])
async def list_rides(
    db: AsyncSession = Depends(get_db),
    status_filter: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 100,
):
    rows = await admin_service.list_rides(
        db, status=status_filter, date_from=date_from, date_to=date_to,
        limit=max(1, min(limit, 500)),
    )
    return [AdminRideRow(**r) for r in rows]


@router.get("/rides/{ride_id}", response_model=AdminRideDetail)
async def ride_detail(
    ride_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    data = await admin_service.ride_detail(db, ride_id)
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ride not found")
    return AdminRideDetail(**data)


# ── Live map ──────────────────────────────────────────────────────────


@router.get("/map/online-drivers", response_model=list[OnlineDriver])
async def online_drivers(
    db: AsyncSession = Depends(get_db),
    r: redis.Redis = Depends(get_redis_dep),
):
    rows = await location.list_online(r)
    if not rows:
        return []
    ids = [uuid.UUID(d) for d, _, _ in rows]
    res = await db.execute(
        select(Driver).where(Driver.id.in_(ids))
    )
    meta = {str(d.id): d for d in res.scalars()}
    out = []
    for driver_id, lat, lng in rows:
        d = meta.get(driver_id)
        out.append(OnlineDriver(
            driver_id=uuid.UUID(driver_id), lat=lat, lng=lng,
            rating=float(d.rating) if d else None,
            car_model=d.car_model if d else None,
            car_number=d.car_number if d else None,
        ))
    return out


# ── Pricing config CRUD ───────────────────────────────────────────────


@router.get("/pricing", response_model=list[PricingConfigPublic])
async def list_pricing(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(PricingConfig).order_by(PricingConfig.id.desc()))
    return [PricingConfigPublic.model_validate(p) for p in res.scalars()]


@router.post("/pricing", response_model=PricingConfigPublic, status_code=201)
async def create_pricing(
    payload: PricingConfigCreate,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    cfg = PricingConfig(**payload.model_dump(), updated_by=admin.id)
    db.add(cfg)
    await db.flush()
    await admin_service.log_action(
        db, admin.id, "pricing_create", entity_type="pricing",
        entity_id=str(cfg.id), new_value=payload.model_dump(mode="json"),
        ip_address=client_ip(request),
    )
    await db.commit()
    await db.refresh(cfg)
    return PricingConfigPublic.model_validate(cfg)


@router.patch("/pricing/{pricing_id}", response_model=PricingConfigPublic)
async def update_pricing(
    pricing_id: int,
    payload: PricingConfigUpdate,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    cfg = await db.get(PricingConfig, pricing_id)
    if cfg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "pricing config not found")
    old = {c: getattr(cfg, c) for c in (
        "base_fare", "base_km", "price_per_km", "min_price",
        "night_multiplier", "is_active",
    )}
    changes = payload.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(cfg, k, v)
    cfg.updated_by = admin.id
    await admin_service.log_action(
        db, admin.id, "pricing_update", entity_type="pricing",
        entity_id=str(pricing_id), old_value={k: str(v) for k, v in old.items()},
        new_value={k: str(v) for k, v in changes.items()},
        ip_address=client_ip(request),
    )
    await db.commit()
    await db.refresh(cfg)
    return PricingConfigPublic.model_validate(cfg)


# ── Commission config ─────────────────────────────────────────────────


@router.get("/commission", response_model=list[CommissionConfigPublic])
async def list_commission(db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(CommissionConfig).order_by(CommissionConfig.id.desc())
    )
    return [CommissionConfigPublic.model_validate(c) for c in res.scalars()]


@router.post("/commission", response_model=CommissionConfigPublic, status_code=201)
async def create_commission(
    payload: CommissionConfigCreate,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    data = payload.model_dump(exclude_none=True)
    cfg = CommissionConfig(**data, created_by=admin.id)
    db.add(cfg)
    await db.flush()
    await admin_service.log_action(
        db, admin.id, "commission_create", entity_type="commission",
        entity_id=str(cfg.id), new_value=payload.model_dump(mode="json"),
        ip_address=client_ip(request),
    )
    await db.commit()
    await db.refresh(cfg)
    return CommissionConfigPublic.model_validate(cfg)


# ── Bonus campaigns ───────────────────────────────────────────────────


@router.get("/bonus-campaigns", response_model=list[BonusCampaignPublic])
async def list_campaigns(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(BonusCampaign).order_by(BonusCampaign.id.desc()))
    return [BonusCampaignPublic.model_validate(c) for c in res.scalars()]


@router.post("/bonus-campaigns", response_model=BonusCampaignPublic, status_code=201)
async def create_campaign(
    payload: BonusCampaignCreate,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    campaign = BonusCampaign(**payload.model_dump(), created_by=admin.id)
    db.add(campaign)
    await db.flush()
    await admin_service.log_action(
        db, admin.id, "bonus_campaign_create", entity_type="bonus_campaign",
        entity_id=str(campaign.id), new_value=payload.model_dump(mode="json"),
        ip_address=client_ip(request),
    )
    await db.commit()
    await db.refresh(campaign)
    return BonusCampaignPublic.model_validate(campaign)


@router.patch("/bonus-campaigns/{campaign_id}", response_model=BonusCampaignPublic)
async def update_campaign(
    campaign_id: int,
    payload: BonusCampaignUpdate,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    campaign = await db.get(BonusCampaign, campaign_id)
    if campaign is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "campaign not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(campaign, k, v)
    await admin_service.log_action(
        db, admin.id, "bonus_campaign_update", entity_type="bonus_campaign",
        entity_id=str(campaign_id),
        new_value=payload.model_dump(mode="json", exclude_unset=True),
        ip_address=client_ip(request),
    )
    await db.commit()
    await db.refresh(campaign)
    return BonusCampaignPublic.model_validate(campaign)


# ── Promo codes ───────────────────────────────────────────────────────


@router.get("/promo-codes", response_model=list[PromoCodePublic])
async def list_promos(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(PromoCode).order_by(PromoCode.id.desc()))
    return [PromoCodePublic.model_validate(p) for p in res.scalars()]


@router.post("/promo-codes", response_model=PromoCodePublic, status_code=201)
async def create_promo(
    payload: PromoCodeCreate,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    data = payload.model_dump()
    data["code"] = data["code"].strip().upper()
    existing = await db.execute(
        select(PromoCode).where(PromoCode.code == data["code"])
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "promo code already exists")
    promo = PromoCode(**data)
    db.add(promo)
    await db.flush()
    await admin_service.log_action(
        db, admin.id, "promo_create", entity_type="promo_code",
        entity_id=str(promo.id), new_value=payload.model_dump(mode="json"),
        ip_address=client_ip(request),
    )
    await db.commit()
    await db.refresh(promo)
    return PromoCodePublic.model_validate(promo)


@router.patch("/promo-codes/{promo_id}", response_model=PromoCodePublic)
async def update_promo(
    promo_id: int,
    payload: PromoCodeUpdate,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    promo = await db.get(PromoCode, promo_id)
    if promo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "promo not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(promo, k, v)
    await admin_service.log_action(
        db, admin.id, "promo_update", entity_type="promo_code",
        entity_id=str(promo_id),
        new_value=payload.model_dump(mode="json", exclude_unset=True),
        ip_address=client_ip(request),
    )
    await db.commit()
    await db.refresh(promo)
    return PromoCodePublic.model_validate(promo)


# ── Stats & audit ─────────────────────────────────────────────────────


@router.get("/stats", response_model=StatsResponse)
async def stats(
    db: AsyncSession = Depends(get_db),
    r: redis.Redis = Depends(get_redis_dep),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    data = await admin_service.get_stats(db, r, date_from, date_to)
    return StatsResponse(**data)


@router.get("/stats/rides-daily", response_model=list[DailyStat])
async def rides_daily(
    db: AsyncSession = Depends(get_db),
    days: int = 30,
):
    days = max(1, min(days, 365))
    return await admin_service.rides_daily(db, days)


@router.get("/audit-logs", response_model=list[AuditLogPublic])
async def audit_logs(
    db: AsyncSession = Depends(get_db),
    limit: int = 100,
):
    res = await db.execute(
        select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(limit)
    )
    return [AuditLogPublic.model_validate(a) for a in res.scalars()]
