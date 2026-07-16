"""Admin service: audit logging, moderation, config CRUD, stats."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import json

import redis.asyncio as redis
from geoalchemy2 import Geometry
from shapely.geometry import mapping, shape
from sqlalchemy import case, cast, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.config import settings
from app.models import (
    AdminAuditLog,
    Driver,
    DriverCommission,
    DriverDocument,
    Payment,
    Rating,
    Ride,
    User,
    Wallet,
    WalletTransaction,
)
from app.services import auth as auth_service
from app.services import location
from app.services import ride as ride_service


async def log_action(
    db: AsyncSession, admin_id: uuid.UUID, action: str, *,
    entity_type: str | None = None, entity_id: str | None = None,
    old_value: dict | None = None, new_value: dict | None = None,
    ip_address: str | None = None,
) -> AdminAuditLog:
    entry = AdminAuditLog(
        admin_id=admin_id, action=action, entity_type=entity_type,
        entity_id=entity_id, old_value=old_value, new_value=new_value,
        ip_address=ip_address,
    )
    db.add(entry)
    await db.flush()
    return entry


# ── Driver / document moderation ──────────────────────────────────────


async def moderate_driver(
    db: AsyncSession, admin_id: uuid.UUID, driver_id: uuid.UUID,
    status: str, reason: str | None, ip: str | None,
) -> Driver:
    driver = await db.get(Driver, driver_id)
    if driver is None:
        raise ValueError("driver not found")
    old = driver.status
    driver.status = status
    if status in {"rejected", "suspended"}:
        driver.is_online = False
    await log_action(
        db, admin_id, f"driver_{status}", entity_type="driver",
        entity_id=str(driver_id), old_value={"status": old},
        new_value={"status": status, "reason": reason}, ip_address=ip,
    )
    await db.commit()
    await db.refresh(driver)
    return driver


async def review_document(
    db: AsyncSession, admin_id: uuid.UUID, doc_id: uuid.UUID,
    status: str, reject_reason: str | None, ip: str | None,
) -> DriverDocument:
    doc = await db.get(DriverDocument, doc_id)
    if doc is None:
        raise ValueError("document not found")
    doc.status = status
    doc.reject_reason = reject_reason
    doc.reviewed_by = admin_id
    doc.reviewed_at = datetime.now()
    await log_action(
        db, admin_id, f"document_{status}", entity_type="driver_document",
        entity_id=str(doc_id), new_value={"status": status}, ip_address=ip,
    )
    await db.commit()
    await db.refresh(doc)
    return doc


async def list_passengers(db: AsyncSession, search: str | None = None) -> list[dict]:
    ride_count = (
        select(Ride.passenger_id, func.count().label("cnt"))
        .group_by(Ride.passenger_id)
        .subquery()
    )
    stmt = (
        select(User, func.coalesce(ride_count.c.cnt, 0))
        .outerjoin(ride_count, ride_count.c.passenger_id == User.id)
        .where(User.role == "passenger")
    )
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(User.full_name.ilike(like) | User.phone.ilike(like))
    stmt = stmt.order_by(User.created_at.desc())

    rows = await db.execute(stmt)
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "phone": u.phone,
            "total_rides": int(cnt),
            "is_blocked": u.is_blocked,
            "created_at": u.created_at,
        }
        for u, cnt in rows
    ]


async def passenger_detail(db: AsyncSession, user_id: uuid.UUID) -> dict | None:
    user = await db.get(User, user_id)
    if user is None or user.role != "passenger":
        return None

    total = int((await db.execute(
        select(func.count()).select_from(Ride).where(Ride.passenger_id == user_id)
    )).scalar() or 0)
    completed = int((await db.execute(
        select(func.count()).select_from(Ride).where(
            Ride.passenger_id == user_id, Ride.status == "completed"
        )
    )).scalar() or 0)
    ratings_given = int((await db.execute(
        select(func.count()).select_from(Rating).where(Rating.from_user_id == user_id)
    )).scalar() or 0)

    return {
        "id": user.id,
        "full_name": user.full_name,
        "phone": user.phone,
        "is_blocked": user.is_blocked,
        "created_at": user.created_at,
        "total_rides": total,
        "completed_rides": completed,
        "ratings_given": ratings_given,
    }


async def list_rides(
    db: AsyncSession, *, status: str | None, date_from, date_to, limit: int
) -> list[dict]:
    PassU = aliased(User)
    DrvU = aliased(User)
    stmt = (
        select(Ride, PassU.full_name, DrvU.full_name)
        .outerjoin(PassU, PassU.id == Ride.passenger_id)
        .outerjoin(Driver, Driver.id == Ride.driver_id)
        .outerjoin(DrvU, DrvU.id == Driver.user_id)
    )
    if status:
        stmt = stmt.where(Ride.status == status)
    if date_from is not None:
        stmt = stmt.where(Ride.created_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(Ride.created_at <= date_to)
    stmt = stmt.order_by(Ride.created_at.desc()).limit(limit)

    rows = await db.execute(stmt)
    return [
        {
            "id": ride.id,
            "passenger_name": pass_name,
            "driver_name": drv_name,
            "from_address": ride.from_address,
            "to_address": ride.to_address,
            "distance_km": ride.distance_km,
            "price_sum": ride.price_sum,
            "status": ride.status,
            "payment_method": ride.payment_method,
            "created_at": ride.created_at,
        }
        for ride, pass_name, drv_name in rows
    ]


async def ride_detail(db: AsyncSession, ride_id: uuid.UUID) -> dict | None:
    ride = await db.get(Ride, ride_id)
    if ride is None:
        return None

    from_lat, from_lng, to_lat, to_lng = (await db.execute(
        select(
            func.ST_Y(cast(Ride.from_location, Geometry)),
            func.ST_X(cast(Ride.from_location, Geometry)),
            func.ST_Y(cast(Ride.to_location, Geometry)),
            func.ST_X(cast(Ride.to_location, Geometry)),
        ).where(Ride.id == ride_id)
    )).one()

    passenger = await db.get(User, ride.passenger_id)
    driver = await db.get(Driver, ride.driver_id) if ride.driver_id else None
    driver_user = await db.get(User, driver.user_id) if driver else None

    payment = (await db.execute(
        select(Payment).where(Payment.ride_id == ride_id)
    )).scalar_one_or_none()
    commission = (await db.execute(
        select(DriverCommission).where(DriverCommission.ride_id == ride_id)
    )).scalar_one_or_none()

    rating_rows = (await db.execute(
        select(Rating).where(Rating.ride_id == ride_id)
    )).scalars().all()
    ratings = [
        {
            "score": r.score,
            "comment": r.comment,
            "from_role": "passenger" if r.from_user_id == ride.passenger_id else "driver",
        }
        for r in rating_rows
    ]

    return {
        "id": ride.id,
        "status": ride.status,
        "from_address": ride.from_address,
        "to_address": ride.to_address,
        "from_lat": from_lat, "from_lng": from_lng,
        "to_lat": to_lat, "to_lng": to_lng,
        "distance_km": ride.distance_km,
        "duration_min": ride.duration_min,
        "price_sum": ride.price_sum,
        "payment_method": ride.payment_method,
        "payment_status": payment.status if payment else None,
        "cancelled_by": ride.cancelled_by,
        "cancel_reason": ride.cancel_reason,
        "created_at": ride.created_at,
        "completed_at": ride.completed_at,
        "passenger_name": passenger.full_name if passenger else None,
        "passenger_phone": passenger.phone if passenger else None,
        "driver_name": driver_user.full_name if driver_user else None,
        "driver_phone": driver_user.phone if driver_user else None,
        "car_model": driver.car_model if driver else None,
        "car_number": driver.car_number if driver else None,
        "commission_sum": commission.commission_sum if commission else None,
        "driver_earning": commission.driver_earning if commission else None,
        "commission_pct": commission.commission_pct if commission else None,
        "ratings": ratings,
    }


def _extract_geometry(geojson: dict) -> dict:
    """Accept a Feature / FeatureCollection / bare geometry → geometry dict."""
    t = geojson.get("type")
    if t in ("Polygon", "MultiPolygon"):
        return geojson
    if t == "Feature":
        return geojson.get("geometry", {})
    if t == "FeatureCollection":
        feats = geojson.get("features", [])
        if feats:
            return feats[0].get("geometry", {})
    raise ValueError("unsupported GeoJSON — need a Polygon/MultiPolygon")


async def get_service_area(db: AsyncSession) -> dict | None:
    row = (await db.execute(text(
        "SELECT name, ST_AsGeoJSON(geom), ST_NPoints(geom::geometry) "
        "FROM service_areas WHERE is_active = TRUE ORDER BY id LIMIT 1"
    ))).first()
    if row is None:
        return None
    return {"name": row[0], "geojson": json.loads(row[1]), "point_count": int(row[2])}


async def update_service_area(
    db: AsyncSession, admin_id: uuid.UUID, name: str | None, geojson: dict,
    ip: str | None,
) -> dict:
    """Validate and replace the active service area. Raises ValueError on bad geo."""
    geometry = _extract_geometry(geojson)
    geom = shape(geometry)
    if geom.geom_type not in ("Polygon", "MultiPolygon"):
        raise ValueError("geometry must be a Polygon or MultiPolygon")
    if not geom.is_valid:
        geom = geom.buffer(0)  # best-effort repair of self-intersections
        if not geom.is_valid:
            raise ValueError("invalid polygon geometry")

    gj = json.dumps(mapping(geom))
    area_name = name or "xizmat hududi"

    await db.execute(text("UPDATE service_areas SET is_active = FALSE"))
    await db.execute(
        text(
            "INSERT INTO service_areas (name, geom, is_active, updated_by) "
            "VALUES (:n, ST_GeomFromGeoJSON(:g)::geography, TRUE, :u)"
        ),
        {"n": area_name, "g": gj, "u": admin_id},
    )
    await log_action(
        db, admin_id, "service_area_update", entity_type="service_area",
        new_value={"name": area_name, "points": len(mapping(geom)["coordinates"])},
        ip_address=ip,
    )
    await db.commit()
    return {"name": area_name}


async def block_user(
    db: AsyncSession, admin_id: uuid.UUID, user_id: uuid.UUID,
    blocked: bool, reason: str | None, ip: str | None,
) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise ValueError("user not found")
    user.is_blocked = blocked
    user.is_active = not blocked
    user.blocked_reason = reason if blocked else None
    await log_action(
        db, admin_id, "block_user" if blocked else "unblock_user",
        entity_type="user", entity_id=str(user_id),
        new_value={"is_blocked": blocked, "reason": reason}, ip_address=ip,
    )
    await db.commit()
    await db.refresh(user)
    return user


# ── Stats ─────────────────────────────────────────────────────────────


async def get_stats(
    db: AsyncSession, r: redis.Redis,
    date_from: datetime | None, date_to: datetime | None,
) -> dict:
    def _ride_filter(stmt):
        if date_from is not None:
            stmt = stmt.where(Ride.created_at >= date_from)
        if date_to is not None:
            stmt = stmt.where(Ride.created_at <= date_to)
        return stmt

    async def _count(*conds) -> int:
        stmt = _ride_filter(select(func.count()).select_from(Ride))
        for c in conds:
            stmt = stmt.where(c)
        return int((await db.execute(stmt)).scalar() or 0)

    rides_total = await _count()
    rides_completed = await _count(Ride.status == "completed")
    rides_cancelled = await _count(Ride.status == "cancelled")
    rides_active = await _count(
        Ride.status.in_(["searching", "accepted", "arrived", "ongoing"])
    )

    rev_stmt = _ride_filter(
        select(func.coalesce(func.sum(Ride.price_sum), 0)).where(
            Ride.status == "completed"
        )
    )
    revenue_sum = int((await db.execute(rev_stmt)).scalar() or 0)

    comm_stmt = select(
        func.coalesce(func.sum(DriverCommission.commission_sum), 0)
    )
    if date_from is not None:
        comm_stmt = comm_stmt.where(DriverCommission.created_at >= date_from)
    if date_to is not None:
        comm_stmt = comm_stmt.where(DriverCommission.created_at <= date_to)
    commission_sum = int((await db.execute(comm_stmt)).scalar() or 0)

    active_drivers = int((await db.execute(
        select(func.count()).select_from(Driver).where(
            Driver.status == "approved"
        )
    )).scalar() or 0)

    online = await location.list_online(r)

    return {
        "rides_total": rides_total,
        "rides_completed": rides_completed,
        "rides_cancelled": rides_cancelled,
        "rides_active": rides_active,
        "revenue_sum": revenue_sum,
        "commission_sum": commission_sum,
        "active_drivers": active_drivers,
        "online_drivers": len(online),
        "period_from": date_from,
        "period_to": date_to,
    }


async def rides_daily(db: AsyncSession, days: int) -> list[dict]:
    """Rides-per-day time series for the last ``days`` days (for the dashboard
    chart). Returns one row per day that has activity, oldest first."""
    since = datetime.now() - timedelta(days=days)
    day = func.date_trunc("day", Ride.created_at)
    completed_flag = case((Ride.status == "completed", 1), else_=0)
    revenue = case((Ride.status == "completed", Ride.price_sum), else_=0)

    stmt = (
        select(
            day.label("day"),
            func.count().label("rides"),
            func.coalesce(func.sum(completed_flag), 0).label("completed"),
            func.coalesce(func.sum(revenue), 0).label("revenue_sum"),
        )
        .where(Ride.created_at >= since)
        .group_by(day)
        .order_by(day)
    )
    rows = await db.execute(stmt)
    return [
        {
            "day": r.day.date(),
            "rides": int(r.rides),
            "completed": int(r.completed),
            "revenue_sum": int(r.revenue_sum),
        }
        for r in rows
    ]


# ── Manual orders (admin dispatch) ────────────────────────────────────


async def create_order(
    db: AsyncSession, admin_id: uuid.UUID, payload, ip: str | None
) -> dict:
    """Create a ride on a passenger's behalf and connect it to a driver.

    connect_mode:
      "auto"   → nearest online driver (normal dispatch loop)
      "offer"  → offer the chosen driver first, fall back to nearest if declined
      "assign" → force-assign the chosen driver (no accept step)
    """
    mode = payload.connect_mode
    if mode not in {"auto", "offer", "assign"}:
        raise ValueError("invalid connect_mode")

    if mode in {"offer", "assign"}:
        if payload.driver_id is None:
            raise ValueError("driver_id required for this connect mode")
        driver = await db.get(Driver, payload.driver_id)
        if driver is None or driver.status != "approved":
            raise ValueError("driver not found or not approved")
        if await ride_service.driver_below_floor(db, driver):
            raise ValueError("driver balance is below the limit")

    # Passenger — must already exist (created on the Clients page).
    user = await db.get(User, payload.passenger_id)
    if user is None:
        raise ValueError("passenger not found")
    # Capture now — attributes expire after the commit inside create_admin_ride.
    passenger_id = user.id
    passenger_phone = user.phone
    passenger_name = user.full_name

    # Create the ride (commits; also persists a newly-created passenger).
    ride = await ride_service.create_admin_ride(
        db, passenger_id,
        from_lat=payload.pickup.lat, from_lng=payload.pickup.lng,
        to_lat=payload.destination.lat, to_lng=payload.destination.lng,
        from_address=payload.pickup.address, to_address=payload.destination.address,
        distance_km=payload.distance_km, payment_method="cash",
    )
    ride_id = ride.id
    price_sum = ride.price_sum
    distance_km = ride.distance_km

    # Connect to a driver.
    if mode == "assign":
        await ride_service.force_assign(str(ride_id), str(payload.driver_id))
    elif mode == "offer":
        ride_service.start_dispatch(
            ride_id, payload.pickup.lat, payload.pickup.lng, prefer=str(payload.driver_id)
        )
    else:  # auto
        ride_service.start_dispatch(ride_id, payload.pickup.lat, payload.pickup.lng)

    await db.refresh(ride)
    status_now = ride.status
    driver_now = ride.driver_id

    await log_action(
        db, admin_id, "order_create", entity_type="ride", entity_id=str(ride_id),
        new_value={
            "mode": mode,
            "passenger_phone": passenger_phone,
            "driver_id": str(payload.driver_id) if payload.driver_id else None,
            "price_sum": price_sum,
        },
        ip_address=ip,
    )
    await db.commit()

    return {
        "ride_id": ride_id,
        "status": status_now,
        "connect_mode": mode,
        "passenger_id": passenger_id,
        "passenger_phone": passenger_phone,
        "passenger_name": passenger_name,
        "driver_id": driver_now,
        "price_sum": price_sum,
        "distance_km": distance_km,
    }


# ── Driver balance (admin-managed wallet) ─────────────────────────────


async def list_drivers_with_balance(
    db: AsyncSession, status: str | None = None
) -> list[dict]:
    """Drivers with their wallet balance and a low-balance flag (for admin)."""
    stmt = (
        select(Driver, User.full_name, User.phone, func.coalesce(Wallet.balance, 0))
        .join(User, User.id == Driver.user_id)
        .outerjoin(Wallet, Wallet.user_id == Driver.user_id)
    )
    if status:
        stmt = stmt.where(Driver.status == status)
    stmt = stmt.order_by(Driver.created_at.desc())

    rows = await db.execute(stmt)
    out = []
    for d, name, phone, bal in rows:
        bal = int(bal)
        out.append({
            "id": d.id,
            "user_id": d.user_id,
            "full_name": name,
            "phone": phone,
            "car_model": d.car_model,
            "car_number": d.car_number,
            "car_color": d.car_color,
            "rating": d.rating,
            "total_rides": d.total_rides,
            "status": d.status,
            "is_online": d.is_online,
            "balance": bal,
            "low_balance": bal <= settings.min_driver_balance,
        })
    return out


async def adjust_driver_balance(
    db: AsyncSession, admin_id: uuid.UUID, driver_id: uuid.UUID,
    amount: int, note: str | None, ip: str | None,
) -> dict:
    """Deposit (amount > 0) or deduct (amount < 0) from a driver's balance,
    recording a wallet transaction and an audit entry."""
    if amount == 0:
        raise ValueError("amount must be non-zero")
    driver = await db.get(Driver, driver_id)
    if driver is None:
        raise ValueError("driver not found")

    wallet = (await db.execute(
        select(Wallet).where(Wallet.user_id == driver.user_id)
    )).scalar_one_or_none()
    if wallet is None:
        wallet = Wallet(user_id=driver.user_id, balance=0)
        db.add(wallet)
        await db.flush()

    wallet.balance = int(wallet.balance) + amount
    new_balance = int(wallet.balance)
    db.add(WalletTransaction(
        wallet_id=wallet.id,
        amount=amount,
        tx_type="deposit" if amount > 0 else "adjustment",
        description=note or ("Admin to‘ldirish" if amount > 0 else "Admin tuzatish"),
        balance_after=new_balance,
    ))
    await log_action(
        db, admin_id, "driver_balance", entity_type="driver",
        entity_id=str(driver_id),
        new_value={"amount": amount, "balance": new_balance, "note": note},
        ip_address=ip,
    )
    await db.commit()
    return {
        "driver_id": driver_id,
        "amount": amount,
        "balance": new_balance,
        "low_balance": new_balance <= settings.min_driver_balance,
    }


async def driver_balance(db: AsyncSession, driver_id: uuid.UUID) -> int:
    """Current wallet balance for a driver (0 if no wallet yet)."""
    driver = await db.get(Driver, driver_id)
    if driver is None:
        return 0
    bal = (await db.execute(
        select(func.coalesce(Wallet.balance, 0)).where(Wallet.user_id == driver.user_id)
    )).scalar()
    return int(bal or 0)


# ── Driver create / edit (admin) ──────────────────────────────────────


def _driver_row(driver, user, balance: int) -> dict:
    return {
        "id": driver.id,
        "user_id": driver.user_id,
        "full_name": user.full_name if user else None,
        "phone": user.phone if user else None,
        "car_model": driver.car_model,
        "car_number": driver.car_number,
        "car_color": driver.car_color,
        "rating": driver.rating,
        "total_rides": driver.total_rides,
        "status": driver.status,
        "is_online": driver.is_online,
        "balance": balance,
        "low_balance": balance <= settings.min_driver_balance,
    }


async def create_driver(
    db: AsyncSession, admin_id: uuid.UUID, payload, ip: str | None
) -> dict:
    """Create a driver from the admin panel: find/create the user by phone,
    promote to the driver role, and attach a car profile."""
    if payload.status not in {"pending", "approved", "rejected", "suspended"}:
        raise ValueError("invalid status")

    user = await auth_service.get_user_by_phone(db, payload.phone)
    if user is None:
        user, _ = await auth_service.get_or_create_user(
            db, payload.phone, payload.full_name, "driver"
        )
    else:
        existing = (await db.execute(
            select(Driver).where(Driver.user_id == user.id)
        )).scalar_one_or_none()
        if existing is not None:
            raise ValueError("this phone already has a driver profile")
        user.role = "driver"
        if payload.full_name:
            user.full_name = payload.full_name

    driver = Driver(
        user_id=user.id,
        car_model=payload.car_model,
        car_number=payload.car_number,
        car_color=payload.car_color,
        car_year=payload.car_year,
        status=payload.status,
    )
    db.add(driver)
    await db.flush()

    # Capture before commit (attributes expire afterwards).
    row = _driver_row(driver, user, 0)
    await log_action(
        db, admin_id, "driver_create", entity_type="driver",
        entity_id=str(driver.id),
        new_value={
            "phone": payload.phone, "full_name": payload.full_name,
            "car_number": payload.car_number, "status": payload.status,
        },
        ip_address=ip,
    )
    await db.commit()
    return row


async def update_driver_profile(
    db: AsyncSession, admin_id: uuid.UUID, driver_id: uuid.UUID, payload, ip: str | None
) -> dict:
    """Edit a driver's name and car details."""
    driver = await db.get(Driver, driver_id)
    if driver is None:
        raise ValueError("driver not found")
    user = await db.get(User, driver.user_id)

    changes: dict = {}
    if payload.full_name is not None and user is not None:
        user.full_name = payload.full_name
        changes["full_name"] = payload.full_name
    for field in ("car_model", "car_number", "car_color", "car_year"):
        val = getattr(payload, field)
        if val is not None:
            setattr(driver, field, val)
            changes[field] = val

    balance = (await db.execute(
        select(func.coalesce(Wallet.balance, 0)).where(Wallet.user_id == driver.user_id)
    )).scalar() or 0
    row = _driver_row(driver, user, int(balance))

    await log_action(
        db, admin_id, "driver_edit", entity_type="driver",
        entity_id=str(driver_id), new_value=changes, ip_address=ip,
    )
    await db.commit()
    return row


# ── Passenger edit (admin) ────────────────────────────────────────────


async def update_passenger(
    db: AsyncSession, admin_id: uuid.UUID, user_id: uuid.UUID, payload, ip: str | None
) -> dict:
    """Edit a passenger's name and/or phone (phone must stay unique)."""
    user = await db.get(User, user_id)
    if user is None or user.role != "passenger":
        raise ValueError("passenger not found")

    changes: dict = {}
    if payload.phone is not None and payload.phone != user.phone:
        existing = await auth_service.get_user_by_phone(db, payload.phone)
        if existing is not None and existing.id != user.id:
            raise ValueError("this phone is already in use")
        user.phone = payload.phone
        changes["phone"] = payload.phone
    if payload.full_name is not None:
        user.full_name = payload.full_name
        changes["full_name"] = payload.full_name

    await log_action(
        db, admin_id, "passenger_edit", entity_type="user",
        entity_id=str(user_id), new_value=changes, ip_address=ip,
    )
    await db.commit()
    detail = await passenger_detail(db, user_id)
    if detail is None:
        raise ValueError("passenger not found")
    return detail


async def create_passenger(
    db: AsyncSession, admin_id: uuid.UUID, payload, ip: str | None
) -> dict:
    """Create a passenger (client) from the admin panel."""
    existing = await auth_service.get_user_by_phone(db, payload.phone)
    if existing is not None:
        raise ValueError("this phone is already registered")
    user, _ = await auth_service.get_or_create_user(
        db, payload.phone, payload.full_name, "passenger"
    )
    user_id = user.id
    await log_action(
        db, admin_id, "passenger_create", entity_type="user",
        entity_id=str(user_id),
        new_value={"phone": payload.phone, "full_name": payload.full_name},
        ip_address=ip,
    )
    await db.commit()
    detail = await passenger_detail(db, user_id)
    if detail is None:
        raise ValueError("could not create passenger")
    return detail


async def lookup_user_by_phone(db: AsyncSession, phone: str) -> dict:
    """Find a user by phone for the order form — returns their name if known."""
    user = await auth_service.get_user_by_phone(db, phone)
    if user is None:
        return {"found": False, "full_name": None, "role": None, "is_blocked": False}
    return {
        "found": True,
        "full_name": user.full_name,
        "role": user.role,
        "is_blocked": user.is_blocked,
    }


async def list_live_rides(db: AsyncSession) -> list[dict]:
    """Active orders (searching / accepted / arrived / ongoing) for the live
    dispatch board, newest first, with passenger + driver contact info."""
    PassU = aliased(User)
    DrvU = aliased(User)
    stmt = (
        select(Ride, PassU.full_name, PassU.phone, DrvU.full_name, DrvU.phone)
        .outerjoin(PassU, PassU.id == Ride.passenger_id)
        .outerjoin(Driver, Driver.id == Ride.driver_id)
        .outerjoin(DrvU, DrvU.id == Driver.user_id)
        .where(Ride.status.in_(["searching", "accepted", "arrived", "ongoing"]))
        .order_by(Ride.created_at.desc())
    )
    rows = await db.execute(stmt)
    return [
        {
            "id": ride.id,
            "passenger_name": pass_name,
            "passenger_phone": pass_phone,
            "driver_name": drv_name,
            "driver_phone": drv_phone,
            "from_address": ride.from_address,
            "to_address": ride.to_address,
            "price_sum": ride.price_sum,
            "status": ride.status,
            "created_at": ride.created_at,
            "accepted_at": ride.accepted_at,
        }
        for ride, pass_name, pass_phone, drv_name, drv_phone in rows
    ]


async def driver_transactions(
    db: AsyncSession, driver_id: uuid.UUID, limit: int = 100
) -> list[dict]:
    """A driver's wallet history — each movement joined to its ride (route +
    price) and commission % where applicable."""
    driver = await db.get(Driver, driver_id)
    if driver is None:
        return []
    wallet = (await db.execute(
        select(Wallet).where(Wallet.user_id == driver.user_id)
    )).scalar_one_or_none()
    if wallet is None:
        return []

    stmt = (
        select(
            WalletTransaction,
            Ride.from_address,
            Ride.to_address,
            DriverCommission.commission_pct,
            DriverCommission.ride_amount,
        )
        .outerjoin(Ride, Ride.id == WalletTransaction.reference_id)
        .outerjoin(
            DriverCommission,
            DriverCommission.ride_id == WalletTransaction.reference_id,
        )
        .where(WalletTransaction.wallet_id == wallet.id)
        .order_by(WalletTransaction.created_at.desc())
        .limit(limit)
    )
    rows = await db.execute(stmt)
    return [
        {
            "id": tx.id,
            "created_at": tx.created_at,
            "tx_type": tx.tx_type,
            "amount": tx.amount,
            "balance_after": tx.balance_after,
            "description": tx.description,
            "ride_id": tx.reference_id if from_addr is not None else None,
            "from_address": from_addr,
            "to_address": to_addr,
            "ride_amount": int(ride_amount) if ride_amount is not None else None,
            "commission_pct": commission_pct,
        }
        for tx, from_addr, to_addr, commission_pct, ride_amount in rows
    ]
