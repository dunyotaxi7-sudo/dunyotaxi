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
import time
import uuid
from datetime import datetime
from decimal import Decimal

import redis.asyncio as redis
from geoalchemy2 import Geometry
from sqlalchemy import cast, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.redis_client import (
    BUSY_DRIVERS_KEY,
    active_ride_key,
    get_redis,
    ride_meter_key,
)
from app.models import Driver, Payment, PromoCode, PromoUsage, Ride, Wallet
from app.services import location, matching, pricing, push, service_area
from app.services.geo import haversine_km, haversine_m, point_wkt
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

# Which drivers a ride is currently being broadcast to (ride_id -> set of
# driver_id strings). The offer goes to all of them at once; the first to accept
# wins and the rest are revoked.
# How often to re-scan for drivers while an order is waiting with nobody in
# range. Short enough that a driver coming online is offered the order almost
# at once; long enough that a quiet night is not a busy-loop on Redis + DB.
NO_CANDIDATE_RETRY_SECONDS = 5

_current_offer: dict[str, set[str]] = {}

# Active ride per driver, so the driver-location WS can relay live position to
# the right passenger: driver_id -> (ride_id, passenger_user_id).


# Which driver is on which ride. In Redis rather than process memory, because
# three things depended on it surviving a restart and none of them did:
#
#   * the distance meter only accumulates while this lookup answers, so an API
#     restart mid-trip silently stopped metering and the passenger was charged
#     the minimum fare;
#   * dispatch skips drivers listed here, so after a restart a driver already
#     on a trip could be offered — or force-assigned — a second one;
#   * a driver whose ride ended outside set_status stayed "busy" forever.
#
# The TTL is a backstop for a trip that never ends cleanly; ordinary
# completion and cancellation both clear the entry.
ACTIVE_RIDE_TTL_SECONDS = 12 * 3600


async def set_active_ride(
    r, driver_id: str, ride_id: str, passenger_user_id: str
) -> None:
    await r.set(
        active_ride_key(driver_id),
        f"{ride_id}|{passenger_user_id}",
        ex=ACTIVE_RIDE_TTL_SECONDS,
    )
    await r.sadd(BUSY_DRIVERS_KEY, driver_id)


async def clear_active_ride(r, driver_id: str | None) -> None:
    if not driver_id:
        return
    await r.delete(active_ride_key(driver_id))
    await r.srem(BUSY_DRIVERS_KEY, driver_id)


async def get_active_ride_for_driver(r, driver_id: str) -> tuple[str, str] | None:
    """Returns (ride_id, passenger_user_id) if the driver has an active ride."""
    raw = await r.get(active_ride_key(driver_id))
    if not raw:
        # The key expired but the set still lists them: heal it here so a
        # driver cannot be left permanently busy by a trip that never ended.
        await r.srem(BUSY_DRIVERS_KEY, driver_id)
        return None
    ride_id, _, passenger_user_id = raw.partition("|")
    return (ride_id, passenger_user_id)


async def busy_driver_ids(r) -> set[str]:
    """Drivers dispatch must skip — those on a trip right now."""
    listed = await r.smembers(BUSY_DRIVERS_KEY)
    alive: set[str] = set()
    for driver_id in listed:
        if await r.exists(active_ride_key(driver_id)):
            alive.add(driver_id)
        else:
            await r.srem(BUSY_DRIVERS_KEY, driver_id)
    return alive


def pending_offer_for_driver(driver_id: str) -> str | None:
    """The ride_id currently being offered to this driver, if any. Lets a
    backgrounded driver app recover an offer it missed on the socket."""
    for ride_id, offered in _current_offer.items():
        if driver_id in offered:
            return ride_id
    return None


# ── Distance meter ────────────────────────────────────────────────────
# Measured server-side from the GPS the driver already streams, not reported by
# the app. Once kilometres are money, a number the app computes is a number the
# app can inflate; this one is derived from data we hold, and the trip's GPS
# trail remains as evidence if a passenger disputes the fare.

# Below this, movement is GPS jitter rather than travel. The anchor is kept
# (not advanced) until movement exceeds it, so a slowly creeping car still has
# its distance counted once it adds up — only a parked one is ignored.
METER_MIN_MOVE_M = 12.0
# A fix implying faster than this is noise or spoofing, not a car. ~200 km/h.
METER_MAX_SPEED_MPS = 55.0
# Two fixes can land almost together — the socket and the background HTTP
# stream both report, or a burst arrives after a reconnect. Dividing by that
# near-zero gap makes ordinary movement look supersonic, and the distance would
# be silently dropped, shortchanging the driver on every reconnect. So speed is
# judged over at least the interval the app streams at, which is the shortest
# gap that carries any information about how fast the car was actually going.
#
# The honest fix is for the app to send the fix's own timestamp, and then this
# floor can go; until the app ships that, arrival time is all the server has.
METER_MIN_DT_SECONDS = 5.0
# A fix this uncertain can appear to jump twenty metres while the car is
# parked. Since updates now arrive on a timer rather than only after real
# movement, a stationary car reports constantly — so a rough fix gets many
# chances to clear the jitter threshold and bill for distance nobody drove.
# Such a fix still updates the live position, because a rough position beats
# none for dispatch; it simply does not move the meter.
METER_MAX_ACCURACY_M = 50.0
# Long enough to outlive any trip, short enough not to litter Redis.
METER_TTL_SECONDS = 24 * 3600


async def start_meter(r, ride_id: str) -> None:
    """Open the meter for a metered ride. Its existence is what tells the
    location stream to measure, so no per-fix database lookup is needed."""
    key = ride_meter_key(ride_id)
    await r.hset(key, mapping={"m": "0"})
    await r.expire(key, METER_TTL_SECONDS)


async def read_meter_km(r, ride_id: str) -> Decimal:
    """Metres accumulated so far, as kilometres."""
    raw = await r.hget(ride_meter_key(ride_id), "m")
    try:
        metres = float(raw) if raw is not None else 0.0
    except (TypeError, ValueError):
        metres = 0.0
    return Decimal(str(round(metres / 1000, 2)))


async def meter_snapshot(
    db: AsyncSession, r, ride: Ride, *, at: datetime | None = None
) -> dict:
    """What the meter reads right now, and what that costs.

    Shared by the live display and by settlement, so the number a driver
    watches climb during the trip is the same number they are paid on — any
    divergence between the two would look like the app cheating someone.
    """
    km = await read_meter_km(r, str(ride.id))
    cfg = await pricing.get_active_config(db)
    price: int | None = None
    if cfg is not None:
        tier = await pricing.tier_multiplier(db, ride.car_type)
        # `at` decides whether the night multiplier applies. Injectable so the
        # fare can be tested at a fixed hour — reading the wall clock made the
        # tests pass by day and fail after 22:00.
        price, _night, _duration = pricing.compute_fare(
            cfg, float(km), at=at or datetime.now(), tier_multiplier=tier
        )
    return {"km": km, "price_sum": price}


async def _meter_add(
    r, ride_id: str, lat: float, lng: float, accuracy_m: float | None = None
) -> None:
    """Fold one GPS fix into the meter. No-op unless the meter is open."""
    if accuracy_m is not None and accuracy_m > METER_MAX_ACCURACY_M:
        return  # too vague to bill on
    key = ride_meter_key(ride_id)
    anchor = await r.hgetall(key)
    if not anchor:
        return  # not a metered ride, or the meter is closed

    now = time.time()
    prev_lat, prev_lng = anchor.get("lat"), anchor.get("lng")
    if prev_lat is None or prev_lng is None:
        # First fix of the trip: nothing to measure from yet.
        await r.hset(key, mapping={"lat": str(lat), "lng": str(lng), "ts": str(now)})
        await r.expire(key, METER_TTL_SECONDS)
        return

    try:
        moved = haversine_m(float(prev_lat), float(prev_lng), lat, lng)
        elapsed = max(now - float(anchor.get("ts", now)), METER_MIN_DT_SECONDS)
    except (TypeError, ValueError):
        await r.hset(key, mapping={"lat": str(lat), "lng": str(lng), "ts": str(now)})
        return

    if moved / elapsed > METER_MAX_SPEED_MPS:
        # Implausible jump — re-anchor here rather than bill for it.
        await r.hset(key, mapping={"lat": str(lat), "lng": str(lng), "ts": str(now)})
        await r.expire(key, METER_TTL_SECONDS)
        return

    if moved < METER_MIN_MOVE_M:
        return  # jitter: keep the old anchor so real creep still accrues

    await r.hincrbyfloat(key, "m", moved)
    await r.hset(key, mapping={"lat": str(lat), "lng": str(lng), "ts": str(now)})
    await r.expire(key, METER_TTL_SECONDS)


async def _meter_add_batch(r, ride_id: str, fixes: list) -> None:
    """Fold a replayed backlog of fixes into the meter, in order.

    The phone keeps receiving GPS with no internet — satellites do not need a
    data connection — so an outage used to be measured as a straight line
    between the last fix that got through and the first one after, losing the
    shape of the road. These are the fixes it could not send at the time.

    The client's timestamps order them, but they never decide how much distance
    may be added: a modified app controls its own clock, and with a per-km fare
    that is a licence to print money. One batch claiming "here at 14:00, forty
    kilometres away at 15:00" looks like an ordinary 40 km/h drive. So the
    whole batch is bounded by time the SERVER observed — at most what is
    physically reachable since the last fix we actually accepted.
    """
    key = ride_meter_key(ride_id)
    anchor = await r.hgetall(key)
    if not anchor:
        return

    now = time.time()
    prev_lat, prev_lng = anchor.get("lat"), anchor.get("lng")
    try:
        last_seen = float(anchor.get("ts", now))
    except (TypeError, ValueError):
        last_seen = now
    budget_m = max(now - last_seen, 0.0) * METER_MAX_SPEED_MPS

    added = 0.0
    for fix in sorted(fixes, key=lambda f: f.ts):
        if fix.accuracy_m is not None and fix.accuracy_m > METER_MAX_ACCURACY_M:
            continue
        if prev_lat is None or prev_lng is None:
            prev_lat, prev_lng = str(fix.lat), str(fix.lng)
            continue
        try:
            moved = haversine_m(float(prev_lat), float(prev_lng), fix.lat, fix.lng)
        except (TypeError, ValueError):
            continue
        if moved < METER_MIN_MOVE_M:
            continue  # jitter: keep the anchor so real creep still accrues
        if added + moved > budget_m:
            break  # beyond what the clock on our side allows
        added += moved
        prev_lat, prev_lng = str(fix.lat), str(fix.lng)

    if added > 0:
        await r.hincrbyfloat(key, "m", added)
    if prev_lat is not None:
        await r.hset(key, mapping={"lat": prev_lat, "lng": prev_lng, "ts": str(now)})
        await r.expire(key, METER_TTL_SECONDS)


async def relay_driver_location_batch(r, driver_id: str, fixes: list) -> None:
    """A driver's backlog after a gap in coverage, newest fix winning the map."""
    if not fixes:
        return
    newest = max(fixes, key=lambda f: f.ts)
    await location.set_location(r, driver_id, newest.lat, newest.lng)
    active = await get_active_ride_for_driver(r, driver_id)
    if active is not None:
        ride_id, passenger_user_id = active
        await _meter_add_batch(r, ride_id, fixes)
        await passenger_ws.send(passenger_user_id, {
            "type": "driver_location",
            "ride_id": ride_id,
            "lat": newest.lat,
            "lng": newest.lng,
        })


async def relay_driver_location(
    r, driver_id: str, lat: float, lng: float, accuracy_m: float | None = None
) -> None:
    """Store a driver's live position (Redis GEO) and, if they're on a ride,
    relay it to that passenger. Shared by the location WS and the HTTP endpoint
    used for background updates."""
    await location.set_location(r, driver_id, lat, lng)
    active = await get_active_ride_for_driver(r, driver_id)
    if active is not None:
        ride_id, passenger_user_id = active
        await _meter_add(r, ride_id, lat, lng, accuracy_m)
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
                   at: datetime, car_type: str = "econom") -> dict:
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

    # Price every active tier so the app can show a selector; fall back to a
    # single econom tier if none are configured yet.
    tiers = await pricing.get_active_car_types(db)
    if not tiers:
        multipliers = {"econom": Decimal("1.0")}
        tier_names = {"econom": "Econom"}
    else:
        multipliers = {t.code: t.multiplier for t in tiers}
        tier_names = {t.code: t.name_uz for t in tiers}
    if car_type not in multipliers:
        car_type = next(iter(multipliers))  # cheapest active tier

    promo = await pricing.get_promo_by_code(db, promo_code)

    tier_quotes = []
    for code, mult in multipliers.items():
        p, night, duration = pricing.compute_fare(cfg, dist, at, mult)
        tier_quotes.append({
            "car_type": code,
            "name": tier_names[code],
            "multiplier": float(mult),
            "price_sum": p,
            "final_price": p - pricing.apply_promo(p, promo),
        })

    selected = next(t for t in tier_quotes if t["car_type"] == car_type)
    price_sum = selected["price_sum"]
    _, night, duration = pricing.compute_fare(cfg, dist, at, multipliers[car_type])
    discount = pricing.apply_promo(price_sum, promo)

    return {
        "distance_km": round(dist, 2),
        "duration_min": duration,
        "base_fare": int(cfg.base_fare),
        "price_per_km": int(cfg.price_per_km),
        "night": night,
        "night_multiplier": float(cfg.night_multiplier),
        "car_type": car_type,
        "tiers": tier_quotes,
        "price_sum": price_sum,
        "discount": discount,
        "final_price": price_sum - discount,
    }


# ── Create + dispatch ─────────────────────────────────────────────────


async def create_ride(db: AsyncSession, passenger_id: uuid.UUID, req) -> Ride:
    car_type = getattr(req, "car_type", None) or "econom"
    metered = req.to_location is None
    if metered and not settings.allow_metered_orders:
        raise RideError(
            "Hisoblagichli buyurtmalar hozircha mavjud emas — "
            "borish manzilini tanlang"
        )

    if metered:
        # Nothing to quote against: only the pickup can be validated, and the
        # fare is settled from the meter when the trip ends. A promo has no
        # price to discount yet, so it is not applied here.
        service_area.check_ride_area(req.from_location.lat, req.from_location.lng)
        q = {
            "distance_km": None, "duration_min": None, "final_price": None,
            "car_type": car_type, "discount": 0,
        }
    else:
        q = await estimate(
            db,
            from_lat=req.from_location.lat, from_lng=req.from_location.lng,
            to_lat=req.to_location.lat, to_lng=req.to_location.lng,
            distance_km=req.distance_km, promo_code=req.promo_code,
            at=datetime.now(), car_type=car_type,
        )
    if req.payment_method not in {"cash", "payme", "click", "uzum", "wallet"}:
        raise RideError("invalid payment method")

    ride = Ride(
        passenger_id=passenger_id,
        from_location=point_wkt(req.from_location.lat, req.from_location.lng),
        to_location=(
            None if metered
            else point_wkt(req.to_location.lat, req.to_location.lng)
        ),
        from_address=req.from_address,
        to_address=None if metered else req.to_address,
        fare_mode="meter" if metered else "fixed",
        distance_km=q["distance_km"],
        duration_min=q["duration_min"],
        price_sum=q["final_price"],
        car_type=q["car_type"],
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
    to_lat: float | None = None,
    to_lng: float | None = None,
    from_address: str,
    to_address: str | None = None,
    distance_km: float | None = None,
    payment_method: str = "cash",
) -> Ride:
    """Create a ride on a passenger's behalf (admin manual order). Same pricing
    and service-area guard as a passenger-created ride, but no promo.

    With no destination the ride is metered: there is nothing to quote against,
    so it carries no price until the meter settles it at completion.
    """
    metered = to_lat is None or to_lng is None
    if metered:
        # Still guard the pickup — estimate() is what checks the service area,
        # and a metered order must not start outside it either.
        service_area.check_ride_area(from_lat, from_lng)
        q = {"distance_km": None, "duration_min": None, "final_price": None}
    else:
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
        to_location=None if metered else point_wkt(to_lat, to_lng),
        from_address=from_address,
        to_address=None if metered else to_address,
        fare_mode="meter" if metered else "fixed",
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


async def _own_driver_id(db, passenger_id) -> str | None:
    """This passenger's own driver profile, if they happen to be a driver.

    Drivers order taxis too (an operator creates the order for them), and
    ``rides.passenger_id`` is a plain user reference, so without this the
    nearest-driver search can hand a driver their own ride — dispatching them
    to collect themselves.
    """
    res = await db.execute(select(Driver.id).where(Driver.user_id == passenger_id))
    driver_id = res.scalar_one_or_none()
    return str(driver_id) if driver_id else None


async def _dispatch_loop(
    ride_id: str,
    lat: float,
    lng: float,
    prefer: str | None = None,
    exclude: set[str] | None = None,
) -> None:
    """Broadcast the ride to every eligible driver within the broadcast radius
    at once; the first to accept wins and the rest are revoked. Repeats with a
    fresh set (excluding those who already declined) until someone accepts, no
    eligible drivers remain, or the ride leaves 'searching'."""
    r = get_redis()
    rejected: set[str] = set(exclude or ())
    timeout = float(settings.driver_accept_timeout_seconds)
    first = prefer  # offer this driver alone first (admin "offer" order)
    # An order created when nobody is in range used to die in the same
    # millisecond it was born: one search, empty list, cancelled. An operator
    # taking the call had no chance to react, and a driver coming online
    # seconds later never saw it. Keep looking for the same window an app
    # order gets on the board — drivers come online and drive into range
    # constantly. list_fallback_seconds = 0 disables the wait, restoring the
    # old give-up-at-once behaviour.
    clock = asyncio.get_running_loop()
    search_deadline = clock.time() + float(settings.list_fallback_seconds)
    # Resolved on the first pass and folded into `rejected`, which every
    # candidate search below already excludes.
    own_driver_checked = False

    try:
        while True:
            async with AsyncSessionLocal() as db:
                ride = await db.get(Ride, uuid.UUID(ride_id))
                if ride is None or ride.status != "searching":
                    return  # cancelled or already handled

                if not own_driver_checked:
                    own_driver_checked = True
                    own = await _own_driver_id(db, ride.passenger_id)
                    if own:
                        rejected.add(own)

                if first and first not in rejected:
                    targets = [(first, 0.0)]
                    first = None
                else:
                    # The order's tier plus every higher tier (hierarchy): a
                    # Komfort driver also serves Econom orders, etc.
                    eligible = await pricing.eligible_car_classes(db, ride.car_type)
                    # Skip drivers already being offered another order or on a
                    # trip. Offer up to broadcast_max_drivers within the radius,
                    # ranked nearest-first.
                    busy = (
                        set().union(*_current_offer.values())
                        if _current_offer else set()
                    ) | await busy_driver_ids(r)
                    candidates = await matching.find_nearest_drivers(
                        db, r, lat, lng, exclude=rejected | busy,
                        radii=[settings.broadcast_radius_meters],
                        limit=settings.broadcast_max_drivers,
                        car_classes=eligible,
                    )
                    # None (not []) means "nobody right now" — handled below,
                    # outside the session so the wait holds no DB connection.
                    targets = (
                        [(c.driver_id, c.distance_m) for c in candidates]
                        if candidates
                        else None
                    )

            if targets is None:
                if clock.time() >= search_deadline:
                    break  # window closed → _no_driver_found
                await asyncio.sleep(NO_CANDIDATE_RETRY_SECONDS)
                continue

            # Atomic claim (no await before setting _current_offer): drop any
            # driver another order grabbed since selection.
            on_a_trip = await busy_driver_ids(r)
            claimed = [
                (d, dm) for d, dm in targets
                if d not in on_a_trip
                and not any(d in s for s in _current_offer.values())
            ]
            if not claimed:
                rejected.update(d for d, _ in targets)
                continue
            claimed_ids = {d for d, _ in claimed}
            _current_offer[ride_id] = claimed_ids
            offer_broker.open(ride_id, claimed_ids)

            # Broadcast to all claimed drivers at once.
            for d, dm in claimed:
                await _offer_to_driver(d, ride_id, dm)

            winner = await offer_broker.wait(ride_id, timeout)
            offered = _current_offer.pop(ride_id, set())

            if winner:
                await _assign_driver(ride_id, winner)
                # Close the offer card for everyone who didn't win.
                await _revoke_offers(offered - {winner}, ride_id)
                return
            # Nobody accepted (all declined or timed out): close their cards,
            # exclude them, and look again — a new driver may have come online.
            await _revoke_offers(offered, ride_id)
            rejected |= offered

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


async def _offer_to_driver(
    driver_id: str, ride_id: str, distance_m: float, notify: bool = True
) -> None:
    """Send a driver an offer card. ``notify=False`` sends the socket event
    only — used when the driver was just pushed about this same order, so one
    order never produces two notifications on their phone."""
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
    if not notify:
        return
    # … plus a high-priority push to wake a backgrounded app.
    try:
        await push.send_to_user(
            get_redis(), user_id, "Yangi buyurtma!",
            "Sizga yangi sayohat taklifi bor",
            data={"type": "ride_offer", "ride_id": ride_id},
            channel_id="orders", sound="order.wav",
        )
    except Exception:  # noqa: BLE001
        log.exception("offer push failed for driver %s", driver_id)


async def _revoke_offers(driver_ids: set[str], ride_id: str) -> None:
    """Tell drivers that a ride they were offered is no longer available (someone
    else took it, or it was cancelled) so their offer card closes immediately."""
    for did in driver_ids:
        user_id = await _driver_user_id(did)
        if user_id:
            await driver_ws.send(
                user_id, {"type": "offer_taken", "ride_id": ride_id}
            )


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
        await set_active_ride(get_redis(), driver_id, ride_id, str(ride.passenger_id))
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


# ── List (marketplace) dispatch ───────────────────────────────────────


async def available_orders(
    db: AsyncSession, driver, lat: float, lng: float
) -> list[dict]:
    """Open orders a driver may claim: 'searching' rides of a tier they serve,
    within the broadcast radius of (lat, lng), nearest pickup first."""
    serveable = await pricing.serveable_car_classes(db, driver.car_class)
    rows = (await db.execute(
        select(
            Ride.id, Ride.from_address, Ride.to_address, Ride.price_sum,
            Ride.car_type, Ride.payment_method, Ride.distance_km,
            Ride.duration_min, Ride.created_at,
            func.ST_Y(cast(Ride.from_location, Geometry)),
            func.ST_X(cast(Ride.from_location, Geometry)),
        ).where(
            Ride.status == "searching",
            Ride.car_type.in_(serveable),
        ).order_by(Ride.created_at.desc()).limit(100)
    )).all()
    out: list[dict] = []
    for (rid, fa, ta, price, ctype, pay, dkm, dur, created, flat, flng) in rows:
        pickup_m = haversine_km(lat, lng, float(flat), float(flng)) * 1000
        if pickup_m <= settings.broadcast_radius_meters:
            out.append({
                "ride_id": str(rid),
                "from_address": fa,
                "to_address": ta,
                "price_sum": price,
                "car_type": ctype,
                "payment_method": pay,
                "distance_km": float(dkm) if dkm is not None else None,
                "duration_min": dur,
                "pickup_distance_m": round(pickup_m, 1),
                "created_at": created,
            })
    out.sort(key=lambda o: o["pickup_distance_m"])
    return out


async def claim_ride(db: AsyncSession, ride_id: uuid.UUID, driver) -> Ride:
    """Driver claims an open order. Atomic first-tap-wins: assigns only while
    the ride is still 'searching'. Raises RideError('already taken') if lost."""
    if await driver_below_floor(db, driver):
        raise RideError("balance below limit")
    if await get_active_ride_for_driver(get_redis(), str(driver.id)) is not None:
        raise RideError("finish your current ride first")
    res = await db.execute(
        update(Ride)
        .where(Ride.id == ride_id, Ride.status == "searching")
        .values(driver_id=driver.id, status="accepted", accepted_at=datetime.now())
    )
    if res.rowcount == 0:
        await db.rollback()
        raise RideError("already taken")
    await db.commit()
    ride = await db.get(Ride, ride_id)
    await set_active_ride(get_redis(), str(driver.id), str(ride_id), str(ride.passenger_id))
    _current_offer.pop(str(ride_id), None)
    offer_broker.cancel(str(ride_id))
    await _notify_passenger(ride, extra={"driver_id": str(driver.id)})
    return ride


def announce_order(ride_id: uuid.UUID, lat: float, lng: float) -> None:
    """Fire-and-forget: ping nearby drivers that a new order is on the board,
    then auto-assign the nearest free driver if nobody claims it in time."""
    asyncio.create_task(_announce_and_fallback(str(ride_id), lat, lng))


async def _announce_and_fallback(ride_id: str, lat: float, lng: float) -> None:
    r = get_redis()
    try:
        async with AsyncSessionLocal() as db:
            ride = await db.get(Ride, uuid.UUID(ride_id))
            if ride is None or ride.status != "searching":
                return
            eligible = await pricing.eligible_car_classes(db, ride.car_type)
            cands = await matching.find_nearest_drivers(
                db, r, lat, lng, radii=[settings.broadcast_radius_meters],
                limit=settings.broadcast_max_drivers, car_classes=eligible,
            )
        pushed: set[str] = set()
        for c in cands:
            user_id = await _driver_user_id(c.driver_id)
            if user_id:
                pushed.add(c.driver_id)
                try:
                    await push.send_to_user(
                        r, user_id, "Yangi buyurtma!",
                        "Yaqiningizda yangi buyurtma bor",
                        data={"type": "new_order", "ride_id": ride_id},
                        channel_id="orders", sound="order.wav",
                    )
                except Exception:  # noqa: BLE001
                    log.exception("new-order push failed for %s", c.driver_id)

        if settings.list_fallback_seconds <= 0:
            return

        # While the board window runs, also offer the order the broadcast way
        # (socket "ride_offer" + /driver/pending-offer). Driver builds older
        # than the order board have no board to poll — the offer card is the
        # only surface on which they can see the order at all, so a push
        # without it just wakes a phone that then shows nothing. Unlike
        # _dispatch_loop this never cancels the ride: the board owns the ride
        # for the whole window, and the fallback below still runs if the
        # window expires unclaimed.
        deadline = asyncio.get_running_loop().time() + settings.list_fallback_seconds
        if await _offer_rounds(ride_id, lat, lng, deadline, pushed):
            return

        async with AsyncSessionLocal() as db:
            ride = await db.get(Ride, uuid.UUID(ride_id))
            if ride is None or ride.status != "searching":
                return
            eligible = await pricing.eligible_car_classes(db, ride.car_type)
            skip = await busy_driver_ids(r)
            own = await _own_driver_id(db, ride.passenger_id)
            if own:
                skip.add(own)
            cands = await matching.find_nearest_drivers(
                db, r, lat, lng, radii=[settings.broadcast_radius_meters],
                limit=1, car_classes=eligible,
                exclude=skip,
            )
        if cands:
            await force_assign(ride_id, cands[0].driver_id)
        else:
            await _no_driver_found(ride_id)
    except Exception:  # noqa: BLE001
        log.exception("announce/fallback failed for ride %s", ride_id)


async def _offer_rounds(
    ride_id: str,
    lat: float,
    lng: float,
    deadline: float,
    pushed: set[str],
) -> bool:
    """Offer a board order to nearby drivers as a broadcast offer card, round
    after round, until someone accepts or ``deadline`` passes.

    Returns True when the ride no longer needs the auto-assign fallback — it
    was accepted here, claimed from the board, or cancelled. Never cancels the
    ride itself; that stays with the board window's fallback.

    ``pushed`` are the drivers the new-order push already reached, so the first
    round doesn't notify them twice about the same order.
    """
    r = get_redis()
    loop = asyncio.get_running_loop()
    rejected: set[str] = set()
    first_round = True
    try:
        while loop.time() < deadline:
            async with AsyncSessionLocal() as db:
                ride = await db.get(Ride, uuid.UUID(ride_id))
                if ride is None or ride.status != "searching":
                    return True  # claimed from the board, cancelled, or gone
                eligible = await pricing.eligible_car_classes(db, ride.car_type)
                # Skip drivers already holding another offer or on a trip.
                busy = (
                    set().union(*_current_offer.values())
                    if _current_offer else set()
                ) | await busy_driver_ids(r)
                candidates = await matching.find_nearest_drivers(
                    db, r, lat, lng, exclude=rejected | busy,
                    radii=[settings.broadcast_radius_meters],
                    limit=settings.broadcast_max_drivers,
                    car_classes=eligible,
                )

            if not candidates:
                # Everyone nearby has passed, or nobody is nearby yet. Give the
                # ones who let an offer time out another shot — over a 5-minute
                # window a single missed card shouldn't shut them out — and
                # wait a beat for a driver to come online.
                rejected.clear()
                await asyncio.sleep(min(5.0, max(0.0, deadline - loop.time())))
                continue

            # Atomic claim (no await before setting _current_offer): drop any
            # driver another order grabbed since selection.
            claimed = [
                (c.driver_id, c.distance_m) for c in candidates
                if c.driver_id not in await busy_driver_ids(r)
                and not any(c.driver_id in s for s in _current_offer.values())
            ]
            if not claimed:
                rejected.update(c.driver_id for c in candidates)
                continue
            claimed_ids = {d for d, _ in claimed}
            _current_offer[ride_id] = claimed_ids
            offer_broker.open(ride_id, claimed_ids)

            for d, dm in claimed:
                await _offer_to_driver(
                    d, ride_id, dm, notify=not (first_round and d in pushed)
                )
            first_round = False

            timeout = min(
                float(settings.driver_accept_timeout_seconds),
                max(1.0, deadline - loop.time()),
            )
            winner = await offer_broker.wait(ride_id, timeout)
            offered = _current_offer.pop(ride_id, set())
            if winner:
                await _assign_driver(ride_id, winner)
                await _revoke_offers(offered - {winner}, ride_id)
                return True
            # Nobody took it this round: close their cards and look again.
            await _revoke_offers(offered, ride_id)
            rejected |= offered
        return False
    except Exception:  # noqa: BLE001
        log.exception("offer rounds failed for ride %s", ride_id)
        return False
    finally:
        _current_offer.pop(ride_id, None)


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
        await set_active_ride(get_redis(), driver_id, ride_id, str(ride.passenger_id))
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
        await clear_active_ride(get_redis(), driver_id)
        await _notify_passenger(ride)

    # Re-dispatch to the nearest driver, skipping the one who declined.
    start_dispatch(
        uuid.UUID(ride_id), float(from_lat), float(from_lng),
        exclude={driver_id},
    )
    return True


# ── Driver decisions (called from HTTP handlers) ──────────────────────


def offered_drivers(ride_id: str) -> set[str]:
    """The set of drivers the ride is currently being offered to."""
    return _current_offer.get(ride_id, set())


def driver_accept(ride_id: str, driver_id: str) -> bool:
    """Resolve a broadcast offer with accept. First accept wins; returns False
    if this driver wasn't offered the ride or someone already accepted."""
    if driver_id not in _current_offer.get(ride_id, set()):
        return False
    return offer_broker.accept(ride_id, driver_id)


def driver_reject(ride_id: str, driver_id: str) -> bool:
    if driver_id not in _current_offer.get(ride_id, set()):
        return False
    return offer_broker.reject(ride_id, driver_id)


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
    revoke_ids: set[str] = set()
    if target == "arrived":
        ride.status = "arrived"
    elif target == "ongoing":
        ride.status = "ongoing"
        ride.started_at = now
        if ride.fare_mode == "meter":
            # Opening the meter is what makes the location stream start
            # measuring — see _meter_add. Nothing is billed before this point,
            # so the drive to the pickup is never on the passenger's fare.
            await start_meter(get_redis(), str(ride_id))
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
        revoke_ids = _current_offer.pop(str(ride_id), set())
        # Completion deletes the meter; cancellation used to leave it behind to
        # sit out its 24-hour TTL, which made "which meters are running?" an
        # unanswerable question when looking for a fault.
        if ride.fare_mode == "meter":
            await get_redis().delete(ride_meter_key(str(ride_id)))

    if target in ("completed", "cancelled") and ride.driver_id:
        await clear_active_ride(get_redis(), str(ride.driver_id))

    await db.commit()
    await db.refresh(ride)
    # Close the offer card for anyone the ride was still being broadcast to.
    if revoke_ids:
        await _revoke_offers(revoke_ids, str(ride_id))
    await _notify_passenger(ride)
    await _notify_driver(ride)
    return ride


def _finalize_waiting(ride: Ride) -> None:
    """If the waiting meter is running, fold the elapsed time into
    ``waiting_seconds`` and stop it. Safe to call when it isn't running."""
    if ride.waiting_started_at is not None:
        elapsed = int((datetime.now() - ride.waiting_started_at).total_seconds())
        ride.waiting_seconds = (ride.waiting_seconds or 0) + max(0, elapsed)
        ride.waiting_started_at = None


# A very rough GPS fix shouldn't be able to unlock the meter from far away, so
# the accuracy we're willing to add to the radius is capped.
_MAX_ACCURACY_SLACK_M = 100.0


async def start_waiting(
    db: AsyncSession, ride_id: uuid.UUID, driver_id: uuid.UUID,
    lat: float | None = None, lng: float | None = None,
    accuracy: float | None = None,
) -> Ride:
    """Driver starts the waiting meter (only at pickup / mid-trip, own ride).

    At pickup the meter charges the passenger, so the driver has to actually be
    there: if the app reports a position, it must be within the configured
    radius of the pickup point. Mid-trip waiting is legitimate anywhere, so it
    is not checked. A client that sends no position is allowed through — older
    builds don't send one, and blocking them would break waiting entirely.
    """
    ride = await _load_ride(db, ride_id)
    if ride.driver_id != driver_id:
        raise RideError("not your ride")
    if ride.status not in ("arrived", "ongoing"):
        raise RideError("waiting is only available after arrival")

    if ride.status == "arrived" and lat is not None and lng is not None:
        cfg = await pricing.get_active_config(db)
        radius = float(getattr(cfg, "wait_radius_meters", 200) or 0) if cfg else 0.0
        if radius > 0:
            # The pickup is a PostGIS geography, so pull lat/lng out of it.
            pt = (await db.execute(
                select(
                    func.ST_Y(cast(Ride.from_location, Geometry)),
                    func.ST_X(cast(Ride.from_location, Geometry)),
                ).where(Ride.id == ride.id)
            )).first()
            if pt is not None:
                slack = min(max(accuracy or 0.0, 0.0), _MAX_ACCURACY_SLACK_M)
                away = haversine_m(lat, lng, float(pt[0]), float(pt[1]))
                if away > radius + slack:
                    raise RideError(
                        f"too far from pickup: {int(away)}m away, "
                        f"must be within {int(radius)}m"
                    )

    if ride.waiting_started_at is None:  # idempotent
        ride.waiting_started_at = datetime.now()
        await db.commit()
        await db.refresh(ride)
        await _notify_passenger(ride)
        await _notify_driver(ride)
    return ride


async def stop_waiting(
    db: AsyncSession, ride_id: uuid.UUID, driver_id: uuid.UUID
) -> Ride:
    """Driver stops the waiting meter; elapsed time is accumulated."""
    ride = await _load_ride(db, ride_id)
    if ride.driver_id != driver_id:
        raise RideError("not your ride")
    if ride.waiting_started_at is not None:  # idempotent
        _finalize_waiting(ride)
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

    cfg = await pricing.get_active_config(db)

    # A metered ride has no quoted price: the fare is settled here, from the
    # distance the server measured while the trip ran. Done before the waiting
    # charge so that charge is added on top, exactly as for a fixed ride.
    if ride.fare_mode == "meter":
        r = get_redis()
        snapshot = await meter_snapshot(db, r, ride)
        await r.delete(ride_meter_key(str(ride_id)))
        ride.metered_km = snapshot["km"]
        if snapshot["price_sum"] is not None:
            ride.price_sum = snapshot["price_sum"]
        # distance_km is the estimate for a fixed ride; for a metered one the
        # measured distance is the only distance there is, so report that.
        ride.distance_km = ride.metered_km

    # Finalize the waiting meter and fold its charge into the fare, so the
    # payment total AND the DB commission both include it.
    _finalize_waiting(ride)
    ride.waiting_charge = (
        pricing.compute_waiting_charge(cfg, ride.waiting_seconds) if cfg else 0
    )
    if ride.waiting_charge:
        ride.price_sum = (ride.price_sum or 0) + ride.waiting_charge

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
    await clear_active_ride(get_redis(), str(ride.driver_id) if ride.driver_id else None)
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
        "waiting_seconds": ride.waiting_seconds,
        "waiting_charge": ride.waiting_charge,
        "waiting_started_at": (
            ride.waiting_started_at.isoformat()
            if ride.waiting_started_at else None
        ),
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
            announce_order(ride_id, float(lat), float(lng))
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
