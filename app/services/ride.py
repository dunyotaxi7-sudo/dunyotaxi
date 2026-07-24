"""Ride lifecycle + driver dispatch.

State machine:
    searching → accepted → arrived → ongoing → completed
              ↘ cancelled (from searching/accepted/arrived/ongoing)

On completion we only flip status to 'completed' and write the payment row;
the DB trigger ``process_ride_completion`` computes commission and updates the
driver's wallet. We never duplicate that logic here.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime

import redis.asyncio as redis
from geoalchemy2 import Geometry
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.redis_client import get_redis
from app.models import Driver, Payment, PromoCode, PromoUsage, Ride, Wallet
from app.services import location, matching, pricing, push, service_area
from app.services.geo import haversine_km, point_wkt
from app.websockets.manager import admin_ws, offer_broker, passenger_ws, driver_ws

log = logging.getLogger("ride")

# Valid forward transitions for the ride status machine.
TRANSITIONS: dict[str, set[str]] = {
    "searching": {"accepted", "cancelled"},
    "accepted": {"arrived", "cancelled"},
    "arrived": {"ongoing", "cancelled"},
    "ongoing": {"completed", "cancelled"},
    "completed": set(),
    "cancelled": set(),
}

# Which driver is currently being offered each ride (ride_id -> driver_id str).
_current_offer: dict[str, str] = {}

# Active ride per driver, so the driver-location WS can relay live position to
# the right passenger: driver_id -> (ride_id, passenger_user_id).
_active_ride_by_driver: dict[str, tuple[str, str]] = {}


def set_active_ride(driver_id: str, ride_id: str, passenger_user_id: str) -> None:
    _active_ride_by_driver[driver_id] = (ride_id, passenger_user_id)


def clear_active_ride(driver_id: str | None) -> None:
    if driver_id:
        _active_ride_by_driver.pop(driver_id, None)


def get_active_ride_for_driver(driver_id: str) -> tuple[str, str] | None:
    """Returns (ride_id, passenger_user_id) if the driver has an active ride."""
    return _active_ride_by_driver.get(driver_id)


def pending_offer_for_driver(driver_id: str) -> str | None:
    """The ride_id currently being offered to this driver, if any. Lets a
    backgrounded driver app recover an offer it missed on the socket."""
    for ride_id, offered in _current_offer.items():
        if offered == driver_id:
            return ride_id
    return None


async def relay_driver_location(r, driver_id: str, lat: float, lng: float) -> None:
    """Store a driver's live position (Redis GEO) and, if they're on a ride,
    relay it to that passenger. Shared by the location WS and the HTTP endpoint
    used for background updates."""
    await location.set_location(r, driver_id, lat, lng)
    active = get_active_ride_for_driver(driver_id)
    if active is not None:
        ride_id, passenger_user_id = active
        await passenger_ws.send(passenger_user_id, {
            "type": "driver_location",
            "ride_id": ride_id,
            "lat": lat,
            "lng": lng,
        })


class RideError(Exception):
    """Domain error for invalid ride operations."""


async def driver_below_floor(db: AsyncSession, driver: Driver) -> bool:
    """True if the driver's balance is at/below the floor (blocked from orders)."""
    bal = (await db.execute(
        select(func.coalesce(Wallet.balance, 0)).where(
            Wallet.user_id == driver.user_id
        )
    )).scalar()
    return int(bal or 0) <= settings.min_driver_balance


def can_transition(current: str, target: str) -> bool:
    return target in TRANSITIONS.get(current, set())


# ── Estimation ────────────────────────────────────────────────────────


async def estimate(db: AsyncSession, *, from_lat, from_lng, to_lat, to_lng,
                   distance_km: float | None, promo_code: str | None,
                   at: datetime) -> dict:
    # Hard geographic gate: both points must be inside the service area.
    service_area.check_ride_area(from_lat, from_lng, to_lat, to_lng)

    cfg = await pricing.get_active_config(db)
    if cfg is None:
        raise RideError("no active pricing config")

    # A client-supplied distance is already a real routed distance; trust it.
    # Otherwise approximate road distance from the straight line (which is always
    # shorter than the actual drive) via the road-distance factor.
    if distance_km is not None:
        dist = distance_km
    else:
        dist = (
            haversine_km(from_lat, from_lng, to_lat, to_lng)
            * settings.road_distance_factor
        )
    price_sum, night, duration = pricing.compute_fare(cfg, dist, at)

    promo = await pricing.get_promo_by_code(db, promo_code)
    discount = pricing.apply_promo(price_sum, promo)

    return {
        "distance_km": round(dist, 2),
        "duration_min": duration,
        "base_fare": int(cfg.base_fare),
        "price_per_km": int(cfg.price_per_km),
        "night": night,
        "night_multiplier": float(cfg.night_multiplier),
        "price_sum": price_sum,
        "discount": discount,
        "final_price": price_sum - discount,
    }


# ── Create + dispatch ─────────────────────────────────────────────────


async def create_ride(db: AsyncSession, passenger_id: uuid.UUID, req) -> Ride:
    q = await estimate(
        db,
        from_lat=req.from_location.lat, from_lng=req.from_location.lng,
        to_lat=req.to_location.lat, to_lng=req.to_location.lng,
        distance_km=req.distance_km, promo_code=req.promo_code,
        at=datetime.now(),
    )
    if req.payment_method not in {"cash", "payme", "click", "uzum", "wallet"}:
        raise RideError("invalid payment method")

    ride = Ride(
        passenger_id=passenger_id,
        from_location=point_wkt(req.from_location.lat, req.from_location.lng),
        to_location=point_wkt(req.to_location.lat, req.to_location.lng),
        from_address=req.from_address,
        to_address=req.to_address,
        distance_km=q["distance_km"],
        duration_min=q["duration_min"],
        price_sum=q["final_price"],
        status="searching",
        payment_method=req.payment_method,
    )
    db.add(ride)
    await db.flush()

    # Record promo usage now that we have a ride id (best-effort).
    if req.promo_code and q["discount"] > 0:
        promo = await pricing.get_promo_by_code(db, req.promo_code)
        if promo is not None:
            db.add(PromoUsage(
                promo_id=promo.id, user_id=passenger_id, ride_id=ride.id,
                discount_amount=q["discount"],
            ))
            promo.used_count = (promo.used_count or 0) + 1

    await db.commit()
    await db.refresh(ride)
    await notify_admins_rides_changed()
    return ride


async def create_admin_ride(
    db: AsyncSession,
    passenger_id: uuid.UUID,
    *,
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    from_address: str,
    to_address: str,
    distance_km: float | None = None,
    payment_method: str = "cash",
) -> Ride:
    """Create a ride on a passenger's behalf (admin manual order). Same pricing
    and service-area guard as a passenger-created ride, but no promo."""
    q = await estimate(
        db,
        from_lat=from_lat, from_lng=from_lng,
        to_lat=to_lat, to_lng=to_lng,
        distance_km=distance_km, promo_code=None,
        at=datetime.now(),
    )
    ride = Ride(
        passenger_id=passenger_id,
        from_location=point_wkt(from_lat, from_lng),
        to_location=point_wkt(to_lat, to_lng),
        from_address=from_address,
        to_address=to_address,
        distance_km=q["distance_km"],
        duration_min=q["duration_min"],
        price_sum=q["final_price"],
        status="searching",
        payment_method=payment_method,
    )
    db.add(ride)
    await db.commit()
    await db.refresh(ride)
    await notify_admins_rides_changed()
    return ride


def start_dispatch(
    ride_id: uuid.UUID,
    lat: float,
    lng: float,
    prefer: str | None = None,
    exclude: set[str] | None = None,
) -> None:
    """Fire-and-forget the dispatch loop for a freshly-created ride.

    ``prefer`` — a driver id to offer first (admin "offer" order); the loop
    falls back to the nearest-driver search if they decline.
    ``exclude`` — driver ids to skip from the start (e.g. one who declined an
    assigned order)."""
    asyncio.create_task(_dispatch_loop(str(ride_id), lat, lng, prefer, exclude))


async def _dispatch_loop(
    ride_id: str,
    lat: float,
    lng: float,
    prefer: str | None = None,
    exclude: set[str] | None = None,
) -> None:
    """Offer the ride to candidate drivers one at a time until one accepts,
    candidates are exhausted, or the ride leaves 'searching'."""
    r = get_redis()
    rejected: set[str] = set(exclude or ())
    timeout = float(settings.driver_accept_timeout_seconds)
    first = prefer  # offer this driver before falling back to nearest search

    try:
        while True:
            async with AsyncSessionLocal() as db:
                ride = await db.get(Ride, uuid.UUID(ride_id))
                if ride is None or ride.status != "searching":
                    return  # cancelled or already handled

                if first and first not in rejected:
                    driver_id, distance_m = first, 0.0
                    first = None
                else:
                    candidates = await matching.find_nearest_drivers(
                        db, r, lat, lng, exclude=rejected, limit=1
                    )
                    if not candidates:
                        break
                    driver_id, distance_m = candidates[0].driver_id, candidates[0].distance_m

            _current_offer[ride_id] = driver_id
            ev = offer_broker.open(ride_id)  # noqa: F841 — opens the slot
            await _offer_to_driver(driver_id, ride_id, distance_m)

            decision = await offer_broker.wait(ride_id, timeout)
            _current_offer.pop(ride_id, None)

            if decision is True:
                await _assign_driver(ride_id, driver_id)
                return
            # Rejected or timed out → try the next driver.
            rejected.add(driver_id)

        await _no_driver_found(ride_id)
    except Exception:  # noqa: BLE001
        log.exception("dispatch loop failed for ride %s", ride_id)


async def _driver_user_id(driver_id: str) -> str | None:
    """Resolve a driver's user id — from cache, else the DB (background offers
    may arrive with no live WS to have populated the cache)."""
    cached = _driver_user_cache.get(driver_id)
    if cached:
        return cached
    async with AsyncSessionLocal() as db:
        drv = await db.get(Driver, uuid.UUID(driver_id))
        if drv is not None:
            _driver_user_cache[driver_id] = str(drv.user_id)
            return str(drv.user_id)
    return None


async def _offer_to_driver(driver_id: str, ride_id: str, distance_m: float) -> None:
    user_id = await _driver_user_id(driver_id)
    if user_id is None:
        return
    payload = {
        "type": "ride_offer",
        "ride_id": ride_id,
        "distance_m": round(distance_m, 1),
        "timeout_s": settings.driver_accept_timeout_seconds,
    }
    # Realtime over the socket (foreground) …
    await driver_ws.send(user_id, payload)
    # … plus a high-priority push to wake a backgrounded app.
    try:
        await push.send_to_user(
            get_redis(), user_id, "Yangi buyurtma!",
            "Sizga yangi sayohat taklifi bor",
            data={"type": "ride_offer", "ride_id": ride_id},
        )
    except Exception:  # noqa: BLE001
        log.exception("offer push failed for driver %s", driver_id)


async def _assign_driver(ride_id: str, driver_id: str) -> None:
    async with AsyncSessionLocal() as db:
        ride = await db.get(Ride, uuid.UUID(ride_id))
        if ride is None or ride.status != "searching":
            return
        ride.driver_id = uuid.UUID(driver_id)
        ride.status = "accepted"
        ride.accepted_at = datetime.now()
        await db.commit()
        await db.refresh(ride)
        # Remember this pairing so live driver GPS can be relayed to the rider.
        set_active_ride(driver_id, ride_id, str(ride.passenger_id))
        await _notify_passenger(ride, extra={"driver_id": driver_id})


async def _no_driver_found(ride_id: str) -> None:
    async with AsyncSessionLocal() as db:
        ride = await db.get(Ride, uuid.UUID(ride_id))
        if ride is None or ride.status != "searching":
            return
        ride.status = "cancelled"
        ride.cancelled_by = "system"
        ride.cancel_reason = "no_driver_found"
        ride.cancelled_at = datetime.now()
        await db.commit()
        await db.refresh(ride)
        await _notify_passenger(ride)


async def force_assign(ride_id: str, driver_id: str) -> bool:
    """Admin force-assign: pin a searching ride to a driver with no accept step.
    The driver's app picks it up via its current-ride poll / a push nudge.
    Returns True if the assignment took effect."""
    async with AsyncSessionLocal() as db:
        ride = await db.get(Ride, uuid.UUID(ride_id))
        if ride is None or ride.status != "searching":
            return False
        ride.driver_id = uuid.UUID(driver_id)
        ride.status = "accepted"
        ride.accepted_at = datetime.now()
        await db.commit()
        await db.refresh(ride)
        set_active_ride(driver_id, ride_id, str(ride.passenger_id))
        await _notify_passenger(ride, extra={"driver_id": driver_id})
    await _notify_driver_assigned(driver_id, ride_id)
    return True


async def _notify_driver_assigned(driver_id: str, ride_id: str) -> None:
    """Tell the driver an order was assigned to them (WS + push)."""
    user_id = await _driver_user_id(driver_id)
    if user_id is None:
        return
    payload = {"type": "ride_assigned", "ride_id": ride_id}
    await driver_ws.send(user_id, payload)
    try:
        await push.send_to_user(
            get_redis(), user_id, "Yangi buyurtma!",
            "Sizga buyurtma biriktirildi",
            data={"type": "ride_assigned", "ride_id": ride_id},
        )
    except Exception:  # noqa: BLE001
        log.exception("assign push failed for driver %s", driver_id)


async def decline_assigned(ride_id: str, driver_id: str) -> bool:
    """A driver declines a ride assigned to them (before pickup). The ride
    returns to 'searching' and re-dispatches to the nearest driver, excluding
    the one who declined. Only valid while the ride is accepted (not yet
    arrived/started). Returns True if it was reassigned."""
    async with AsyncSessionLocal() as db:
        ride = await db.get(Ride, uuid.UUID(ride_id))
        if (
            ride is None
            or str(ride.driver_id) != driver_id
            or ride.status != "accepted"
        ):
            return False
        from_lat, from_lng = (await db.execute(
            select(
                func.ST_Y(cast(Ride.from_location, Geometry)),
                func.ST_X(cast(Ride.from_location, Geometry)),
            ).where(Ride.id == ride.id)
        )).one()
        ride.driver_id = None
        ride.status = "searching"
        ride.accepted_at = None
        await db.commit()
        await db.refresh(ride)
        clear_active_ride(driver_id)
        await _notify_passenger(ride)

    # Re-dispatch to the nearest driver, skipping the one who declined.
    start_dispatch(
        uuid.UUID(ride_id), float(from_lat), float(from_lng),
        exclude={driver_id},
    )
    return True


# ── Driver decisions (called from HTTP handlers) ──────────────────────


def offered_driver(ride_id: str) -> str | None:
    return _current_offer.get(ride_id)


def driver_accept(ride_id: str, driver_id: str) -> bool:
    """Resolve a pending offer with accept. Returns False if not the offeree."""
    if _current_offer.get(ride_id) != driver_id:
        return False
    return offer_broker.resolve(ride_id, True)


def driver_reject(ride_id: str, driver_id: str) -> bool:
    if _current_offer.get(ride_id) != driver_id:
        return False
    return offer_broker.resolve(ride_id, False)


# ── Status transitions (arrived / ongoing / completed / cancelled) ────


async def _load_ride(db: AsyncSession, ride_id: uuid.UUID) -> Ride:
    ride = await db.get(Ride, ride_id)
    if ride is None:
        raise RideError("ride not found")
    return ride


async def set_status(
    db: AsyncSession, ride_id: uuid.UUID, target: str, *,
    by_driver_id: uuid.UUID | None = None,
    by_passenger_id: uuid.UUID | None = None,
    cancel_reason: str | None = None,
) -> Ride:
    ride = await _load_ride(db, ride_id)
    if not can_transition(ride.status, target):
        raise RideError(f"cannot move from {ride.status} to {target}")

    now = datetime.now()
    if target == "arrived":
        ride.status = "arrived"
    elif target == "ongoing":
        ride.status = "ongoing"
        ride.started_at = now
    elif target == "completed":
        ride.status = "completed"
        ride.completed_at = now
    elif target == "cancelled":
        ride.status = "cancelled"
        ride.cancelled_at = now
        ride.cancelled_by = "driver" if by_driver_id else (
            "passenger" if by_passenger_id else "system"
        )
        ride.cancel_reason = cancel_reason
        offer_broker.cancel(str(ride_id))
        _current_offer.pop(str(ride_id), None)

    if target in ("completed", "cancelled") and ride.driver_id:
        clear_active_ride(str(ride.driver_id))

    await db.commit()
    await db.refresh(ride)
    await _notify_passenger(ride)
    await _notify_driver(ride)
    return ride


async def complete_ride(db: AsyncSession, ride_id: uuid.UUID,
                        method: str | None, external_id: str | None) -> Ride:
    """Flip to 'completed' and create the payment row. The DB trigger does the
    commission + wallet bookkeeping."""
    ride = await _load_ride(db, ride_id)
    if not can_transition(ride.status, "completed"):
        raise RideError(f"cannot complete from {ride.status}")

    pay_method = method or ride.payment_method
    payment = Payment(
        ride_id=ride.id,
        amount=ride.price_sum or 0,
        method=pay_method,
        status="completed" if pay_method == "cash" else "pending",
        external_id=external_id,
        paid_at=datetime.now() if pay_method == "cash" else None,
    )
    db.add(payment)

    ride.status = "completed"
    ride.completed_at = datetime.now()
    if method:
        ride.payment_method = method

    await db.commit()  # commit triggers process_ride_completion in the DB
    await db.refresh(ride)
    clear_active_ride(str(ride.driver_id) if ride.driver_id else None)
    await _notify_passenger(ride)
    return ride


# ── WebSocket notification helpers ────────────────────────────────────

# driver_id -> driver.user_id (so we can route to the driver's WS, which is
# keyed by user id). Populated lazily by the driver-location WS handler.
_driver_user_cache: dict[str, str] = {}


def cache_driver_user(driver_id: str, user_id: str) -> None:
    _driver_user_cache[driver_id] = user_id


def _ride_event(ride: Ride, extra: dict | None = None) -> dict:
    msg = {
        "type": "ride_status",
        "ride_id": str(ride.id),
        "status": ride.status,
        "driver_id": str(ride.driver_id) if ride.driver_id else None,
        "price_sum": ride.price_sum,
        "cancelled_by": ride.cancelled_by,
        "cancel_reason": ride.cancel_reason,
    }
    if extra:
        msg.update(extra)
    return msg


# Push copy per status the passenger cares about.
_PUSH_TEXT: dict[str, tuple[str, str]] = {
    "accepted": ("Haydovchi topildi", "Haydovchingiz yo'lga chiqdi"),
    "arrived": ("Haydovchi yetib keldi", "Haydovchi sizni kutmoqda"),
    "completed": ("Sayohat yakunlandi", "Bizni tanlaganingiz uchun rahmat"),
    "cancelled": ("Sayohat bekor qilindi", "Sayohat bekor qilindi"),
}


async def _push_passenger(ride: Ride) -> None:
    """Best-effort push for status changes the rider should be notified about."""
    text = _PUSH_TEXT.get(ride.status)
    if text is None:
        return
    title, body = text
    if ride.status == "cancelled" and ride.cancel_reason == "no_driver_found":
        title, body = "Haydovchi topilmadi", "Iltimos, qaytadan urinib ko'ring"
    try:
        await push.send_to_user(
            get_redis(), str(ride.passenger_id), title, body,
            data={"type": "ride", "ride_id": str(ride.id), "status": ride.status},
        )
    except Exception:  # noqa: BLE001
        log.exception("push_passenger failed for ride %s", ride.id)


async def _notify_passenger(ride: Ride, extra: dict | None = None) -> None:
    await passenger_ws.send(str(ride.passenger_id), _ride_event(ride, extra))
    await _push_passenger(ride)
    await notify_admins_rides_changed()


async def notify_admins_rides_changed() -> None:
    """Nudge the admin live-orders board that active orders changed."""
    try:
        await admin_ws.broadcast({"type": "rides_changed"})
    except Exception:  # noqa: BLE001
        log.exception("admin broadcast failed")


async def _notify_driver(ride: Ride, extra: dict | None = None) -> None:
    if not ride.driver_id:
        return
    user_id = _driver_user_cache.get(str(ride.driver_id))
    if user_id:
        await driver_ws.send(user_id, _ride_event(ride, extra))


# ── Startup recovery ──────────────────────────────────────────────────

# A ride shouldn't legitimately stay 'searching' longer than this; beyond it we
# treat it as abandoned (dispatch loop died on a previous process stop).
STALE_SEARCH_SECONDS = 180


async def recover_searching_rides() -> None:
    """On boot, resume recently-'searching' rides (their in-memory dispatch loop
    died when the process stopped) and cancel stale ones."""
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(
                Ride.id,
                Ride.created_at,
                func.ST_Y(cast(Ride.from_location, Geometry)),
                func.ST_X(cast(Ride.from_location, Geometry)),
            ).where(Ride.status == "searching")
        )).all()

    if not rows:
        return
    now = datetime.now()
    resumed = stale = 0
    for ride_id, created_at, lat, lng in rows:
        age = (now - created_at).total_seconds() if created_at else 1e9
        if age <= STALE_SEARCH_SECONDS:
            start_dispatch(ride_id, float(lat), float(lng))
            resumed += 1
        else:
            await _no_driver_found(str(ride_id))
            stale += 1
    log.info(
        "startup: recovered searching rides — %d resumed, %d stale cancelled",
        resumed, stale,
    )


# ── Stats helper (used by admin) ──────────────────────────────────────


async def active_ride_count(db: AsyncSession) -> int:
    res = await db.execute(
        select(func.count()).select_from(Ride).where(
            Ride.status.in_(["searching", "accepted", "arrived", "ongoing"])
        )
    )
    return int(res.scalar() or 0)
