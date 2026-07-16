"""Live driver location store backed by Redis GEO.

Online drivers live in a single geo set (``drivers:online``). Positions are
written with GEOADD as they stream in over the WebSocket, and removed when the
driver goes offline.
"""
from __future__ import annotations

import redis.asyncio as redis

from app.core.redis_client import DRIVERS_GEO_KEY


async def set_location(r: redis.Redis, driver_id: str, lat: float, lng: float) -> None:
    """GEOADD a driver's current position. Redis stores (lng, lat)."""
    await r.geoadd(DRIVERS_GEO_KEY, (lng, lat, driver_id))


async def remove_driver(r: redis.Redis, driver_id: str) -> None:
    await r.zrem(DRIVERS_GEO_KEY, driver_id)


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
    out: list[tuple[str, float]] = []
    for row in rows:
        # redis-py returns [name, distance] when withdist=True.
        name, dist = row[0], float(row[1])
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
    out: list[tuple[str, float, float, float]] = []
    for row in rows:
        # With withdist + withcoord: [name, distance, [lng, lat]].
        name, dist, coord = row[0], float(row[1]), row[2]
        out.append((name, dist, float(coord[1]), float(coord[0])))
    return out


async def list_online(r: redis.Redis) -> list[tuple[str, float, float]]:
    """All online drivers as (driver_id, lat, lng) — for the admin live map."""
    ids = await r.zrange(DRIVERS_GEO_KEY, 0, -1)
    out: list[tuple[str, float, float]] = []
    if not ids:
        return out
    positions = await r.geopos(DRIVERS_GEO_KEY, *ids)
    for driver_id, pos in zip(ids, positions):
        if pos is None:
            continue
        lng, lat = pos
        out.append((driver_id, float(lat), float(lng)))
    return out
