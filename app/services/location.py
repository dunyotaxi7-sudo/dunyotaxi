"""Live driver location store backed by Redis GEO.

Online drivers live in a single geo set (``drivers:online``). Positions are
written with GEOADD as they stream in. A driver only counts as online while
they're *actively* streaming: each update also refreshes a per-driver freshness
key (``drivers:seen:<id>``) with a TTL, and every read filters to drivers whose
key is still alive — so a crashed/closed/no-signal app drops out automatically
instead of lingering as a frozen "ghost". Explicit go-offline removes them too.
"""
from __future__ import annotations

import time

import redis.asyncio as redis

from app.core.config import settings
from app.core.redis_client import DRIVERS_GEO_KEY

_SEEN_PREFIX = "drivers:seen:"


async def set_location(r: redis.Redis, driver_id: str, lat: float, lng: float) -> None:
    """GEOADD a driver's current position (Redis stores lng, lat) and refresh
    their freshness marker."""
    await r.geoadd(DRIVERS_GEO_KEY, (lng, lat, driver_id))
    await r.set(
        _SEEN_PREFIX + driver_id,
        int(time.time()),
        ex=settings.driver_location_ttl_seconds,
    )


async def remove_driver(r: redis.Redis, driver_id: str) -> None:
    await r.zrem(DRIVERS_GEO_KEY, driver_id)
    await r.delete(_SEEN_PREFIX + driver_id)


async def _fresh_ids(r: redis.Redis, ids: list) -> set[str]:
    """Of ``ids``, the drivers still streaming (freshness key alive). Stale ones
    are lazily removed from the geo set so ghosts vanish from map + dispatch."""
    if not ids:
        return set()
    ids = [i.decode() if isinstance(i, (bytes, bytearray)) else i for i in ids]
    pipe = r.pipeline()
    for i in ids:
        pipe.exists(_SEEN_PREFIX + i)
    flags = await pipe.execute()
    fresh: set[str] = set()
    stale: list[str] = []
    for i, alive in zip(ids, flags):
        (fresh.add if alive else stale.append)(i)
    if stale:
        await r.zrem(DRIVERS_GEO_KEY, *stale)
    return fresh


async def get_location(r: redis.Redis, driver_id: str) -> tuple[float, float] | None:
    """Return (lat, lng) for a driver, or None if not online."""
    res = await r.geopos(DRIVERS_GEO_KEY, driver_id)
    if not res or res[0] is None:
        return None
    lng, lat = res[0]
    return float(lat), float(lng)


async def search_radius(
    r: redis.Redis, lat: float, lng: float, radius_m: int, count: int = 50
) -> list[tuple[str, float]]:
    """GEOSEARCH around a point. Returns [(driver_id, distance_m), ...] sorted
    nearest-first."""
    rows = await r.geosearch(
        DRIVERS_GEO_KEY,
        longitude=lng,
        latitude=lat,
        radius=radius_m,
        unit="m",
        withdist=True,
        sort="ASC",
        count=count,
    )
    fresh = await _fresh_ids(r, [row[0] for row in rows])
    out: list[tuple[str, float]] = []
    for row in rows:
        # redis-py returns [name, distance] when withdist=True.
        name, dist = row[0], float(row[1])
        if name in fresh:
            out.append((name, dist))
    return out


async def search_radius_with_coords(
    r: redis.Redis, lat: float, lng: float, radius_m: int, count: int = 50
) -> list[tuple[str, float, float, float]]:
    """GEOSEARCH returning (driver_id, distance_m, lat, lng), nearest-first."""
    rows = await r.geosearch(
        DRIVERS_GEO_KEY,
        longitude=lng,
        latitude=lat,
        radius=radius_m,
        unit="m",
        withdist=True,
        withcoord=True,
        sort="ASC",
        count=count,
    )
    fresh = await _fresh_ids(r, [row[0] for row in rows])
    out: list[tuple[str, float, float, float]] = []
    for row in rows:
        # With withdist + withcoord: [name, distance, [lng, lat]].
        name, dist, coord = row[0], float(row[1]), row[2]
        if name in fresh:
            out.append((name, dist, float(coord[1]), float(coord[0])))
    return out


async def list_online(r: redis.Redis) -> list[tuple[str, float, float]]:
    """All online drivers as (driver_id, lat, lng) — for the admin live map."""
    ids = await r.zrange(DRIVERS_GEO_KEY, 0, -1)
    out: list[tuple[str, float, float]] = []
    if not ids:
        return out
    fresh = await _fresh_ids(r, list(ids))
    ids = [i for i in ids if (i.decode() if isinstance(i, (bytes, bytearray)) else i) in fresh]
    if not ids:
        return out
    positions = await r.geopos(DRIVERS_GEO_KEY, *ids)
    for driver_id, pos in zip(ids, positions):
        if pos is None:
            continue
        lng, lat = pos
        out.append((driver_id, float(lat), float(lng)))
    return out
