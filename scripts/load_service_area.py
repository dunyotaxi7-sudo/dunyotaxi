"""Load the service-area boundary polygon into the DB (service_areas table).

Reads data/bukhara_region.geojson and upserts it as the active service area.
Re-runnable — replaces any existing area with the same name.

    python -m scripts.load_service_area
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from sqlalchemy import text

from app.core.database import engine

GEOJSON = Path("data/bukhara_region.geojson")


async def main() -> None:
    feat = json.loads(GEOJSON.read_text(encoding="utf-8"))
    name = feat.get("properties", {}).get("name", "Buxoro viloyati")
    geom_json = json.dumps(feat["geometry"])

    async with engine.begin() as conn:
        await conn.execute(
            text("DELETE FROM service_areas WHERE name = :name"), {"name": name}
        )
        await conn.execute(
            text(
                """
                INSERT INTO service_areas (name, geom, is_active)
                VALUES (:name, ST_GeomFromGeoJSON(:gj)::geography, TRUE)
                """
            ),
            {"name": name, "gj": geom_json},
        )
        # sanity: Bukhara city must be inside, Navoiy city outside
        inside = (await conn.execute(text(
            "SELECT ST_Covers(geom, ST_MakePoint(64.421, 39.767)::geography) "
            "FROM service_areas WHERE name = :name"), {"name": name})).scalar()
        outside = (await conn.execute(text(
            "SELECT ST_Covers(geom, ST_MakePoint(65.38, 40.10)::geography) "
            "FROM service_areas WHERE name = :name"), {"name": name})).scalar()

    print(f"loaded '{name}' — Bukhara inside={inside}, Navoiy inside={outside}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
