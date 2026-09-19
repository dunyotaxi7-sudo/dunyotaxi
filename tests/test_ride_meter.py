"""The server-side distance meter.

Kilometres are money here, so the meter is measured from the GPS the driver
already streams rather than reported by the app. These tests pin the filters
that stand between a noisy GPS chip and a wrong fare.
"""
from __future__ import annotations

import time

import pytest

from app.services import ride as ride_service

RIDE = "ride-1"

# Roughly 111 m per 0.001° of latitude in Bukhara.
LAT, LNG = 39.7681, 64.4215


class FakeRedis:
    """Hash store with the few operations the meter uses."""

    def __init__(self) -> None:
        self.store: dict[str, dict[str, str]] = {}

    async def hset(self, key, mapping=None, **_):
        self.store.setdefault(key, {}).update(
            {k: str(v) for k, v in (mapping or {}).items()}
        )

    async def hgetall(self, key):
        return dict(self.store.get(key, {}))

    async def hget(self, key, field):
        return self.store.get(key, {}).get(field)

    async def hincrbyfloat(self, key, field, amount):
        cur = float(self.store.setdefault(key, {}).get(field, 0))
        self.store[key][field] = str(cur + amount)
        return self.store[key][field]

    async def expire(self, key, seconds):
        return True

    async def delete(self, key):
        self.store.pop(key, None)


class FakeClock:
    """Fixes arrive every few seconds in production; the tests should too."""

    def __init__(self):
        self.now = 1_000_000.0

    def time(self):
        return self.now

    def tick(self, seconds=5.0):
        self.now += seconds


@pytest.fixture
def r():
    return FakeRedis()


@pytest.fixture
def clock(monkeypatch):
    c = FakeClock()
    monkeypatch.setattr(ride_service.time, "time", c.time)
    return c


async def _anchor_at(r, lat, lng, seconds_ago=5.0):
    """Open a meter already anchored at a point, as mid-trip."""
    await ride_service.start_meter(r, RIDE)
    await r.hset(
        ride_service.ride_meter_key(RIDE),
        mapping={"lat": lat, "lng": lng, "ts": ride_service.time.time() - seconds_ago},
    )


async def test_a_closed_meter_measures_nothing(r):
    """Every driver streams GPS; only a metered trip should accumulate."""
    await ride_service._meter_add(r, RIDE, LAT, LNG)
    assert await ride_service.read_meter_km(r, RIDE) == 0


async def test_the_first_fix_only_sets_the_anchor(r):
    await ride_service.start_meter(r, RIDE)
    await ride_service._meter_add(r, RIDE, LAT, LNG)
    assert await ride_service.read_meter_km(r, RIDE) == 0


async def test_normal_movement_accumulates(r):
    await _anchor_at(r, LAT, LNG)
    # ~111 m north over 5 s — about 80 km/h, an ordinary road speed.
    await ride_service._meter_add(r, RIDE, LAT + 0.001, LNG)

    km = float(await ride_service.read_meter_km(r, RIDE))
    assert 0.10 < km < 0.12


async def test_a_parked_car_is_not_billed_for_jitter(r):
    """A stationary GPS wanders a few metres. Left unfiltered, a car waiting
    at the kerb would quietly run up a fare."""
    await _anchor_at(r, LAT, LNG)
    for _ in range(20):
        await ride_service._meter_add(r, RIDE, LAT + 0.00002, LNG + 0.00002)

    assert await ride_service.read_meter_km(r, RIDE) == 0


async def test_slow_creep_is_still_counted_once_it_adds_up(r, clock):
    """Jitter is ignored by keeping the anchor, not by advancing it — so a car
    crawling in traffic is not quietly travelling for free."""
    await _anchor_at(r, LAT, LNG)
    for step in range(1, 11):  # ten small hops, ~11 m each
        clock.tick()
        await ride_service._meter_add(r, RIDE, LAT + 0.0001 * step, LNG)

    km = float(await ride_service.read_meter_km(r, RIDE))
    assert km > 0.09, "accumulated creep must eventually register"


async def test_an_impossible_jump_is_not_billed(r):
    """GPS noise or a spoofed location can teleport a car across the city."""
    await _anchor_at(r, LAT, LNG, seconds_ago=5.0)
    await ride_service._meter_add(r, RIDE, LAT + 0.5, LNG + 0.5)  # ~70 km in 5 s

    assert await ride_service.read_meter_km(r, RIDE) == 0


async def test_after_an_impossible_jump_the_meter_carries_on(r, clock):
    """Re-anchored at the bogus point, not stuck: the trip keeps measuring."""
    await _anchor_at(r, LAT, LNG, seconds_ago=5.0)
    await ride_service._meter_add(r, RIDE, LAT + 0.5, LNG + 0.5)  # rejected
    clock.tick()
    await ride_service._meter_add(r, RIDE, LAT + 0.501, LNG + 0.5)  # ~111 m

    km = float(await ride_service.read_meter_km(r, RIDE))
    assert 0.10 < km < 0.12


async def test_a_corrupt_anchor_does_not_break_the_trip(r):
    await ride_service.start_meter(r, RIDE)
    await r.hset(
        ride_service.ride_meter_key(RIDE),
        mapping={"lat": "not-a-number", "lng": LNG, "ts": time.time()},
    )
    await ride_service._meter_add(r, RIDE, LAT, LNG)  # must not raise
    assert await ride_service.read_meter_km(r, RIDE) == 0


async def test_a_burst_of_fixes_is_not_mistaken_for_teleporting(r, clock):
    """The socket and the background HTTP stream can both report, or a burst
    can arrive after a reconnect. Dividing by that near-zero gap once made
    ordinary movement look supersonic, and the distance was silently dropped —
    shortchanging the driver on every reconnect."""
    await _anchor_at(r, LAT, LNG)
    # Three fixes ~111 m apart landing in the same instant.
    for step in range(1, 4):
        await ride_service._meter_add(r, RIDE, LAT + 0.001 * step, LNG)

    km = float(await ride_service.read_meter_km(r, RIDE))
    assert km > 0.3, "a burst must still be measured, not discarded"
