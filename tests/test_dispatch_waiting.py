"""An order must not die in the millisecond it is created.

Operator-created orders go through _dispatch_loop. It used to run one search
and cancel the ride outright if nobody was in range — 13 orders in a fortnight
died that way, average life 14.5 seconds, before any driver could come online
or drive into range. Now it keeps looking for the same window an app order
gets on the board.
"""
from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace

import pytest

from app.services import ride as ride_service


class NoBusyDrivers:
    """Redis stand-in for a quiet night: nobody is on a trip."""

    async def smembers(self, _key):
        return set()

    async def exists(self, _key):
        return 0

    async def srem(self, *_args):
        return 0


class FakeSession:
    """Just enough session for the loop: it only calls db.get(Ride, id)."""

    def __init__(self, ride):
        self._ride = ride

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, _model, _id):
        return self._ride


@pytest.fixture
def dispatch(monkeypatch):
    """Runs the loop against a ride nobody can serve, counting the searches."""
    ride = SimpleNamespace(
        status="searching", car_type="econom", passenger_id=uuid.uuid4()
    )
    state = {"searches": 0, "gave_up": False}

    monkeypatch.setattr(ride_service, "AsyncSessionLocal", lambda: FakeSession(ride))
    monkeypatch.setattr(ride_service, "get_redis", lambda: NoBusyDrivers())
    monkeypatch.setattr(ride_service, "_own_driver_id", _async_none)
    monkeypatch.setattr(
        ride_service.pricing, "eligible_car_classes", _async_list
    )

    async def _never_any_drivers(*_a, **_kw):
        state["searches"] += 1
        return []

    async def _gave_up(_ride_id):
        state["gave_up"] = True
        ride.status = "cancelled"

    monkeypatch.setattr(
        ride_service.matching, "find_nearest_drivers", _never_any_drivers
    )
    monkeypatch.setattr(ride_service, "_no_driver_found", _gave_up)
    # Keep the test quick: a 0.6s window polled every 0.1s.
    monkeypatch.setattr(ride_service, "NO_CANDIDATE_RETRY_SECONDS", 0.1)
    monkeypatch.setattr(ride_service.settings, "list_fallback_seconds", 0.6)
    return state


async def _async_none(*_a, **_kw):
    return None


async def _async_list(*_a, **_kw):
    return ["econom"]


async def test_it_keeps_looking_instead_of_cancelling_at_once(dispatch):
    await ride_service._dispatch_loop(str(uuid.uuid4()), 39.77, 64.42)

    # The old behaviour searched exactly once and gave up immediately.
    assert dispatch["searches"] > 1, "should re-scan while the window is open"
    assert dispatch["gave_up"] is True, "should still give up once it closes"


async def test_it_gives_up_when_the_window_closes(dispatch):
    started = asyncio.get_running_loop().time()
    await ride_service._dispatch_loop(str(uuid.uuid4()), 39.77, 64.42)
    elapsed = asyncio.get_running_loop().time() - started

    # It waited out the window rather than failing instantly...
    assert elapsed >= 0.5
    # ...but did not hang on past it.
    assert elapsed < 3.0


async def test_a_ride_that_stops_searching_ends_the_loop(dispatch, monkeypatch):
    """Someone claimed it from the board, or it was cancelled — stop at once."""
    async def _one_search_then_taken(*_a, **_kw):
        dispatch["searches"] += 1
        return []

    monkeypatch.setattr(
        ride_service.matching, "find_nearest_drivers", _one_search_then_taken
    )
    # The loop re-reads the ride each pass; flip it after the first search.
    original = ride_service.AsyncSessionLocal

    class Flipping(FakeSession):
        async def get(self, model, rid):
            r = await super().get(model, rid)
            if dispatch["searches"] >= 1:
                r.status = "accepted"
            return r

    ride = SimpleNamespace(
        status="searching", car_type="econom", passenger_id=uuid.uuid4()
    )
    monkeypatch.setattr(ride_service, "AsyncSessionLocal", lambda: Flipping(ride))

    await ride_service._dispatch_loop(str(uuid.uuid4()), 39.77, 64.42)

    assert dispatch["gave_up"] is False, "a claimed ride must not be cancelled"
    assert original is not None
