"""Nearest-driver matching.

The algorithm (per spec):

  1. GEOSEARCH ``drivers:online`` within an expanding radius — 3 km, then 5 km,
     then 8 km — stopping at the first radius that yields any candidate.
  2. Keep only drivers that are ``approved`` and not already on a ride.
  3. Rank by distance ascending, then by rating descending.

The pure ranking step (:func:`rank_candidates`) is separated from Redis/DB I/O
so it can be unit-tested in isolation.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

import redis.asyncio as redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import Driver, Wallet
from app.services import location


@dataclass(frozen=True)
class Candidate:
    driver_id: str
    distance_m: float
    rating: float


def rank_candidates(candidates: list[Candidate]) -> list[Candidate]:
    """Rank by distance ascending, then rating descending. Pure & deterministic."""
    return sorted(candidates, key=lambda c: (round(c.distance_m, 3), -c.rating))


async def _search_expanding(
    r: redis.Redis, lat: float, lng: float, radii: list[int]
) -> list[tuple[str, float]]:
    """Try each radius in order; return the first non-empty result set."""
    for radius in radii:
        found = await location.search_radius(r, lat, lng, radius)
        if found:
            return found
    return []


async def find_nearest_drivers(
    db: AsyncSession,
    r: redis.Redis,
    lat: float,
    lng: float,
    *,
    exclude: set[str] | None = None,
    limit: int = 10,
    radii: list[int] | None = None,
) -> list[Candidate]:
    """Return ranked, eligible candidate drivers near (lat, lng).

    ``exclude`` is a set of driver-id strings to skip (e.g. drivers that already
    rejected this ride, or are busy).
    """
    radii = radii or settings.match_radii_meters
    exclude = exclude or set()

    raw = await _search_expanding(r, lat, lng, radii)
    raw = [(d, dist) for d, dist in raw if d not in exclude]
    if not raw:
        return []

    # Validate eligibility & pull ratings from the DB in one query. Drivers at or
    # below the balance floor are skipped — they must top up before taking orders.
    ids = [uuid.UUID(d) for d, _ in raw]
    res = await db.execute(
        select(Driver.id, Driver.rating)
        .outerjoin(Wallet, Wallet.user_id == Driver.user_id)
        .where(
            Driver.id.in_(ids),
            Driver.status == "approved",
            Driver.is_online.is_(True),
            func.coalesce(Wallet.balance, 0) > settings.min_driver_balance,
        )
    )
    rating_by_id = {str(row.id): float(row.rating) for row in res}

    candidates = [
        Candidate(driver_id=d, distance_m=dist, rating=rating_by_id[d])
        for d, dist in raw
        if d in rating_by_id
    ]
    return rank_candidates(candidates)[:limit]


async def nearby_drivers_for_display(
    db: AsyncSession,
    r: redis.Redis,
    lat: float,
    lng: float,
    *,
    radius_m: int = 5000,
    limit: int = 30,
) -> list[dict]:
    """Online *approved* drivers near a point, with positions — for showing car
    markers on the passenger map. Read-only; does not affect dispatch."""
    raw = await location.search_radius_with_coords(r, lat, lng, radius_m, count=limit)
    if not raw:
        return []
    ids = [uuid.UUID(d) for d, *_ in raw]
    res = await db.execute(
        select(Driver.id).where(
            Driver.id.in_(ids),
            Driver.status == "approved",
            Driver.is_online.is_(True),
        )
    )
    approved = {str(row.id) for row in res}
    return [
        {"driver_id": d, "distance_m": round(dist, 1), "lat": mlat, "lng": mlng}
        for d, dist, mlat, mlng in raw
        if d in approved
    ]
