"""Service-area restriction — the authoritative allow/deny gate on locations.

The active boundary polygon is cached in memory (shapely) on startup so every
request does a fast in-process point-in-polygon test instead of hitting the DB.
The DB copy (service_areas) remains the source of truth and is admin-updatable;
call :func:`reload` after it changes.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.geometry.base import BaseGeometry
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger("service_area")

_FALLBACK_FILE = Path("data/bukhara_region.geojson")

_geom: BaseGeometry | None = None
_name: str = "xizmat hududi"


class OutsideServiceArea(Exception):
    """Raised when a ride point is outside the allowed area.

    ``point`` is ``"pickup"`` or ``"destination"``.
    """

    def __init__(self, point: str):
        self.point = point
        super().__init__(f"{point} is outside the service area")


async def load(db: AsyncSession) -> None:
    """Cache the active boundary in memory — from the DB, else the bundled file."""
    global _geom, _name
    try:
        row = (await db.execute(text(
            "SELECT name, ST_AsGeoJSON(geom) FROM service_areas "
            "WHERE is_active = TRUE ORDER BY id LIMIT 1"
        ))).first()
        if row is not None:
            _name = row[0]
            _geom = shape(json.loads(row[1]))
            log.info("service area loaded from DB: %s", _name)
            return
    except Exception:  # noqa: BLE001 — table may not exist yet
        log.exception("failed to load service area from DB; trying file")

    if _FALLBACK_FILE.exists():
        feat = json.loads(_FALLBACK_FILE.read_text(encoding="utf-8"))
        _geom = shape(feat["geometry"])
        _name = feat.get("properties", {}).get("name", _name)
        log.info("service area loaded from file: %s", _name)
    else:
        log.warning("no service area available — restriction is OPEN")


async def reload(db: AsyncSession) -> None:
    await load(db)


def area_name() -> str:
    return _name


def is_within_service_area(lat: float, lng: float) -> bool:
    """Fast in-memory point-in-polygon. Fails OPEN (allows) if no area is loaded
    — the bundled file makes that effectively impossible in practice."""
    if _geom is None:
        return True
    return _geom.covers(Point(lng, lat))


def check_ride_area(
    from_lat: float, from_lng: float, to_lat: float, to_lng: float
) -> None:
    """Raise :class:`OutsideServiceArea` if pickup or destination is outside."""
    if not is_within_service_area(from_lat, from_lng):
        raise OutsideServiceArea("pickup")
    if not is_within_service_area(to_lat, to_lng):
        raise OutsideServiceArea("destination")
