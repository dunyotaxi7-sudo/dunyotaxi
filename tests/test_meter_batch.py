"""Replaying a backlog of fixes after a gap in coverage.

The phone keeps receiving GPS without a data connection, so an outage leaves
it holding positions nobody has seen. Replaying them measures the road that was
actually driven instead of a straight line across the gap.

The dangerous part is the clock. A batch carries the phone's own timestamps,
and with a per-kilometre fare a modified app that controls its clock controls
the fare. So the tests that matter here are the ones about what a batch is
*not* allowed to claim.
"""
from __future__ import annotations

import time
from types import SimpleNamespace

import pytest

from app.services import ride as ride_service

RIDE = "ride-batch"
LAT, LNG = 39.7681, 64.4215


class FakeRedis:
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

    async def expire(self, key, seconds):
        return True


def fix(lat, lng, ts, accuracy=8.0):
    return SimpleNamespace(lat=lat, lng=lng, ts=ts, accuracy_m=accuracy)


@pytest.fixture
def r():
    return FakeRedis()


async def _open_meter(r, seconds_since_last_fix: float):
    """A meter whose last accepted fix was this long ago — the outage."""
    await ride_service.start_meter(r, RIDE)
    await r.hset(
        ride_meter_key(RIDE),
        mapping={"lat": LAT, "lng": LNG, "ts": time.time() - seconds_since_last_fix},
    )


ride_meter_key = ride_service.ride_meter_key


async def test_a_backlog_is_measured_along_its_path(r):
    """Ten hops of ~111 m recorded during a two-minute gap: the road, not the
    straight line between its ends."""
    await _open_meter(r, seconds_since_last_fix=120)
    now = time.time()
    fixes = [fix(LAT + 0.001 * i, LNG, now - 120 + i * 10) for i in range(1, 11)]

    await ride_service._meter_add_batch(r, RIDE, fixes)

    km = float(await ride_service.read_meter_km(r, RIDE))
    assert 1.0 < km < 1.2


async def test_a_batch_cannot_claim_more_than_the_clock_allows(r):
    """The attack: one batch asserting a long, slow drive that never happened.
    Forty kilometres 'over an hour' arriving sixty seconds after the last real
    fix looks perfectly ordinary until you ask our own clock."""
    await _open_meter(r, seconds_since_last_fix=60)
    now = time.time()
    fixes = [
        fix(LAT, LNG, now - 3600),
        fix(LAT + 0.36, LNG, now),  # ~40 km away
    ]

    await ride_service._meter_add_batch(r, RIDE, fixes)

    km = float(await ride_service.read_meter_km(r, RIDE))
    # 60 seconds of server-observed time at 55 m/s is 3.3 km, and no more.
    assert km <= 3.4, "a batch must not outrun the time we actually saw pass"


async def test_an_honest_long_outage_is_still_paid(r):
    """The bound must not punish a real ten-minute tunnel: 8 km over 600
    observed seconds is well inside what is physically possible."""
    await _open_meter(r, seconds_since_last_fix=600)
    now = time.time()
    fixes = [fix(LAT + 0.0072 * i, LNG, now - 600 + i * 60) for i in range(1, 11)]

    await ride_service._meter_add_batch(r, RIDE, fixes)

    km = float(await ride_service.read_meter_km(r, RIDE))
    assert km > 7.5, "a genuine outage must be measured, not clipped"


async def test_vague_fixes_in_a_backlog_are_skipped(r):
    await _open_meter(r, seconds_since_last_fix=120)
    now = time.time()
    fixes = [fix(LAT + 0.001 * i, LNG, now - 120 + i * 10, accuracy=200.0)
             for i in range(1, 11)]

    await ride_service._meter_add_batch(r, RIDE, fixes)

    assert float(await ride_service.read_meter_km(r, RIDE)) == 0


async def test_fixes_out_of_order_are_sorted_before_measuring(r):
    """A batch is a buffer flushed after a failure; nothing guarantees order."""
    await _open_meter(r, seconds_since_last_fix=120)
    now = time.time()
    fixes = [fix(LAT + 0.001 * i, LNG, now - 120 + i * 10) for i in (3, 1, 2)]

    await ride_service._meter_add_batch(r, RIDE, fixes)

    km = float(await ride_service.read_meter_km(r, RIDE))
    # Walked 1->2->3 (~333 m), not jumped 3->1->2.
    assert 0.30 < km < 0.36


async def test_a_closed_meter_ignores_a_backlog(r):
    """A fixed-fare ride, or one already settled, must not gain distance."""
    await ride_service._meter_add_batch(r, RIDE, [fix(LAT, LNG, time.time())])

    assert await ride_service.read_meter_km(r, RIDE) == 0
