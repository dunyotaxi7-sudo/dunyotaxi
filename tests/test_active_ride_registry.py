"""Which driver is on which ride.

This lived in process memory, and three separate things quietly depended on it
surviving a restart: the distance meter (which only accumulates while this
lookup answers), dispatch skipping busy drivers, and a driver being released
when their ride ends. A deploy broke all three at once, silently.
"""
from __future__ import annotations

import pytest

from app.services import ride as ride_service

DRIVER = "driver-1"
RIDE = "ride-1"
PASSENGER = "passenger-user-1"


class FakeRedis:
    """Strings + sets, with a switch to expire a key as Redis would."""

    def __init__(self) -> None:
        self.kv: dict[str, str] = {}
        self.sets: dict[str, set[str]] = {}

    async def set(self, key, value, ex=None):
        self.kv[key] = str(value)

    async def get(self, key):
        return self.kv.get(key)

    async def delete(self, key):
        self.kv.pop(key, None)

    async def exists(self, key):
        return 1 if key in self.kv else 0

    async def sadd(self, key, member):
        self.sets.setdefault(key, set()).add(member)

    async def srem(self, key, member):
        self.sets.get(key, set()).discard(member)

    async def smembers(self, key):
        return set(self.sets.get(key, set()))

    def expire_now(self, key):
        """Simulate the TTL elapsing, leaving the set entry behind."""
        self.kv.pop(key, None)


@pytest.fixture
def r():
    return FakeRedis()


async def test_a_driver_on_a_ride_is_found(r):
    await ride_service.set_active_ride(r, DRIVER, RIDE, PASSENGER)

    assert await ride_service.get_active_ride_for_driver(r, DRIVER) == (
        RIDE, PASSENGER,
    )


async def test_an_idle_driver_has_no_ride(r):
    assert await ride_service.get_active_ride_for_driver(r, DRIVER) is None


async def test_the_lookup_survives_a_restart(r):
    """The whole point: process memory did not, so the meter stopped mid-trip
    and the passenger was charged the minimum fare."""
    await ride_service.set_active_ride(r, DRIVER, RIDE, PASSENGER)

    # A restart loses every module-level dict but not Redis.
    assert await ride_service.get_active_ride_for_driver(r, DRIVER) == (
        RIDE, PASSENGER,
    )
    assert DRIVER in await ride_service.busy_driver_ids(r)


async def test_dispatch_skips_a_driver_on_a_trip(r):
    await ride_service.set_active_ride(r, DRIVER, RIDE, PASSENGER)
    assert await ride_service.busy_driver_ids(r) == {DRIVER}


async def test_finishing_a_ride_frees_the_driver(r):
    await ride_service.set_active_ride(r, DRIVER, RIDE, PASSENGER)
    await ride_service.clear_active_ride(r, DRIVER)

    assert await ride_service.get_active_ride_for_driver(r, DRIVER) is None
    assert await ride_service.busy_driver_ids(r) == set()


async def test_clearing_nothing_is_harmless(r):
    await ride_service.clear_active_ride(r, None)  # must not raise


async def test_an_expired_ride_does_not_leave_a_driver_busy_forever(r):
    """A trip that never ends cleanly must not block the driver for good — the
    TTL releases them, and the busy set heals to match."""
    await ride_service.set_active_ride(r, DRIVER, RIDE, PASSENGER)
    r.expire_now(ride_service.active_ride_key(DRIVER))

    assert await ride_service.busy_driver_ids(r) == set()
    assert await ride_service.get_active_ride_for_driver(r, DRIVER) is None
    # ...and the stale set entry is gone, not merely filtered out each time.
    assert await r.smembers(ride_service.BUSY_DRIVERS_KEY) == set()


async def test_a_second_ride_replaces_the_first(r):
    await ride_service.set_active_ride(r, DRIVER, RIDE, PASSENGER)
    await ride_service.set_active_ride(r, DRIVER, "ride-2", "passenger-2")

    assert await ride_service.get_active_ride_for_driver(r, DRIVER) == (
        "ride-2", "passenger-2",
    )
