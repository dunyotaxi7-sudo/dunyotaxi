"""The live meter and the settled fare must be one calculation.

A driver watches a number climb during the trip and is paid on a number
computed at the end. If those ever disagree, the app looks like it is cheating
someone — so both go through meter_snapshot.
"""
from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.services import pricing
from app.services import ride as ride_service


class Cfg:
    base_fare = 5000
    base_km = Decimal("0.0")
    price_per_km = 2000
    min_price = 5000
    night_multiplier = Decimal("1.20")
    night_start = __import__("datetime").time(22, 0)
    night_end = __import__("datetime").time(6, 0)


@pytest.fixture
def patched(monkeypatch):
    async def _cfg(_db):
        return Cfg()

    async def _tier(_db, _code):
        return Decimal("1")

    monkeypatch.setattr(pricing, "get_active_config", _cfg)
    monkeypatch.setattr(pricing, "tier_multiplier", _tier)


class MeterAt:
    """Redis stand-in reporting a fixed distance."""

    def __init__(self, metres: float):
        self.metres = metres

    async def hget(self, _key, _field):
        return str(self.metres)


def _ride():
    return SimpleNamespace(id="ride-1", car_type="econom")


async def test_a_stationary_car_reads_the_minimum(patched):
    snap = await ride_service.meter_snapshot(None, MeterAt(0), _ride())

    assert snap["km"] == Decimal("0.00")
    assert snap["price_sum"] == 5000, "the floor, not a free ride"


async def test_five_kilometres_costs_base_plus_distance(patched):
    snap = await ride_service.meter_snapshot(None, MeterAt(5000), _ride())

    assert snap["km"] == Decimal("5.00")
    # 5000 base + 5 km x 2000
    assert snap["price_sum"] == 15000


async def test_the_fare_climbs_with_the_distance(patched):
    """What the driver watches: every extra kilometre must add to the total."""
    prices = [
        (await ride_service.meter_snapshot(None, MeterAt(m), _ride()))["price_sum"]
        for m in (0, 1000, 2000, 3000)
    ]

    assert prices == sorted(prices)
    assert len(set(prices)) == len(prices), "each km must change the fare"


async def test_every_metre_is_charged_because_base_km_is_zero(patched):
    """Production has base_km = 0.0, so the 5000 base covers no distance at
    all: a 120 m hop is 5000 + 0.12 x 2000 = 5240, not 5000. That is a pricing
    choice rather than a bug, but it means there is no "included" distance —
    worth knowing before anyone assumes short trips cost the base fare."""
    snap = await ride_service.meter_snapshot(None, MeterAt(120), _ride())

    assert snap["price_sum"] == 5240
    assert snap["price_sum"] >= 5000, "never below the configured floor"


async def test_a_missing_pricing_config_reports_no_price(monkeypatch):
    """Rather than inventing a free ride."""
    async def _none(_db):
        return None

    monkeypatch.setattr(pricing, "get_active_config", _none)
    snap = await ride_service.meter_snapshot(None, MeterAt(4000), _ride())

    assert snap["km"] == Decimal("4.00")
    assert snap["price_sum"] is None
