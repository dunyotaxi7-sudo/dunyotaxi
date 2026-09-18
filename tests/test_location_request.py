"""Tests for operator→passenger location requests.

The privacy-sensitive parts are the ones worth pinning down: a request only
ever answers for the passenger it was opened for, it can only be answered once,
and it dies with its TTL.
"""
from __future__ import annotations

import pytest

from app.services import location_request as lr


class FakeRedis:
    """Hash-aware async Redis stand-in with a controllable clock."""

    def __init__(self) -> None:
        self.store: dict[str, list] = {}  # key -> [value, expires_at|None]
        self.now = 1_000.0

    def _alive(self, key: str):
        item = self.store.get(key)
        if item is None:
            return None
        if item[1] is not None and item[1] <= self.now:
            self.store.pop(key, None)
            return None
        return item

    async def set(self, key, value, ex=None):
        self.store[key] = [str(value), self.now + ex if ex else None]

    async def get(self, key):
        item = self._alive(key)
        return item[0] if item else None

    async def delete(self, *keys):
        for k in keys:
            self.store.pop(k, None)

    async def hset(self, key, mapping=None, **_):
        item = self._alive(key)
        if item is None:
            item = [{}, None]
            self.store[key] = item
        item[0].update({k: str(v) for k, v in (mapping or {}).items()})

    async def hgetall(self, key):
        item = self._alive(key)
        return dict(item[0]) if item else {}

    async def expire(self, key, seconds):
        item = self._alive(key)
        if item:
            item[1] = self.now + seconds

    async def ttl(self, key):
        item = self._alive(key)
        if item is None:
            return -2
        if item[1] is None:
            return -1
        return int(item[1] - self.now)


PASSENGER = "11111111-1111-1111-1111-111111111111"
OTHER = "22222222-2222-2222-2222-222222222222"
OPERATOR = "33333333-3333-3333-3333-333333333333"


@pytest.fixture
def r() -> FakeRedis:
    return FakeRedis()


async def test_new_request_starts_pending(r):
    request_id = await lr.create(r, PASSENGER, asked_by=OPERATOR)
    req = await lr.get(r, request_id)

    assert req["status"] == lr.STATUS_PENDING
    assert req["user_id"] == PASSENGER
    assert req["asked_by"] == OPERATOR
    assert req["lat"] is None and req["lng"] is None


async def test_cooldown_blocks_immediate_re_ask(r):
    await lr.create(r, PASSENGER, asked_by=OPERATOR)
    assert await lr.cooldown_left(r, PASSENGER) > 0
    # A different passenger is unaffected.
    assert await lr.cooldown_left(r, OTHER) == 0

    r.now += lr.COOLDOWN_SECONDS + 1
    assert await lr.cooldown_left(r, PASSENGER) == 0


async def test_sharing_records_a_typed_fix(r):
    request_id = await lr.create(r, PASSENGER, asked_by=OPERATOR)
    await lr.answer(
        r,
        request_id,
        PASSENGER,
        lat=39.7681,
        lng=64.4215,
        address="Buxoro, Mustaqillik ko'chasi",
        accuracy_m=12.5,
    )

    req = await lr.get(r, request_id)
    assert req["status"] == lr.STATUS_SHARED
    # Redis hands back strings; callers must get real numbers.
    assert req["lat"] == pytest.approx(39.7681)
    assert req["lng"] == pytest.approx(64.4215)
    assert req["accuracy_m"] == pytest.approx(12.5)
    assert req["address"] == "Buxoro, Mustaqillik ko'chasi"


async def test_another_user_cannot_answer_and_request_stays_open(r):
    request_id = await lr.create(r, PASSENGER, asked_by=OPERATOR)

    with pytest.raises(lr.LocationRequestError):
        await lr.answer(r, request_id, OTHER, lat=1.0, lng=2.0)

    req = await lr.get(r, request_id)
    assert req["status"] == lr.STATUS_PENDING
    assert req["lat"] is None


async def test_a_request_is_answered_only_once(r):
    request_id = await lr.create(r, PASSENGER, asked_by=OPERATOR)
    await lr.answer(r, request_id, PASSENGER, lat=39.7, lng=64.4)

    with pytest.raises(lr.LocationRequestError):
        await lr.answer(r, request_id, PASSENGER, lat=1.0, lng=2.0)
    with pytest.raises(lr.LocationRequestError):
        await lr.decline(r, request_id, PASSENGER)

    req = await lr.get(r, request_id)
    assert req["lat"] == pytest.approx(39.7)


async def test_decline_is_reported_not_swallowed(r):
    request_id = await lr.create(r, PASSENGER, asked_by=OPERATOR)
    await lr.decline(r, request_id, PASSENGER)

    req = await lr.get(r, request_id)
    assert req["status"] == lr.STATUS_DECLINED
    assert req["lat"] is None


async def test_request_expires_with_its_ttl(r):
    request_id = await lr.create(r, PASSENGER, asked_by=OPERATOR)
    r.now += lr.REQUEST_TTL_SECONDS + 1

    assert await lr.get(r, request_id) is None
    with pytest.raises(lr.LocationRequestError):
        await lr.answer(r, request_id, PASSENGER, lat=39.7, lng=64.4)


async def test_answer_does_not_extend_the_window_indefinitely(r):
    """An answered request stays readable for the operator, then goes away —
    stale coordinates must not outlive the call."""
    request_id = await lr.create(r, PASSENGER, asked_by=OPERATOR)
    r.now += 60
    await lr.answer(r, request_id, PASSENGER, lat=39.7, lng=64.4)

    assert (await lr.get(r, request_id))["status"] == lr.STATUS_SHARED
    r.now += lr.REQUEST_TTL_SECONDS + 1
    assert await lr.get(r, request_id) is None


async def test_unknown_request_id_is_not_found(r):
    assert await lr.get(r, "does-not-exist") is None


async def test_long_address_is_trimmed_not_rejected(r):
    """A wordy geocoder label must not cost us the fix, nor overflow the
    address column an order is later created with."""
    request_id = await lr.create(r, PASSENGER, asked_by=OPERATOR)
    await lr.answer(
        r, request_id, PASSENGER, lat=39.7, lng=64.4, address="Buxoro " * 60
    )

    req = await lr.get(r, request_id)
    assert req["status"] == lr.STATUS_SHARED
    assert len(req["address"]) == lr.MAX_ADDRESS_CHARS


# ── HTTP wiring ───────────────────────────────────────────────────────
# The passenger endpoints need no database, so they can be exercised for real
# with the dependencies overridden — this is what catches an unregistered
# router or a guard mapped to the wrong status code.


@pytest.fixture
def client(r):
    from types import SimpleNamespace

    from fastapi.testclient import TestClient

    import main
    from app.api.deps import get_current_user, get_redis_dep

    main.app.dependency_overrides[get_redis_dep] = lambda: r
    main.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=PASSENGER, role="passenger"
    )
    # No context manager: these routes need neither the real Redis nor the DB,
    # and running the lifespan would have the test suite dialling both.
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


async def test_share_endpoint_records_the_fix(client, r):
    request_id = await lr.create(r, PASSENGER, asked_by=OPERATOR)

    resp = client.post(
        f"/location-requests/{request_id}/share",
        json={"lat": 39.7681, "lng": 64.4215, "accuracy_m": 8},
    )

    assert resp.status_code == 200
    assert resp.json()["status"] == lr.STATUS_SHARED
    assert (await lr.get(r, request_id))["lat"] == pytest.approx(39.7681)


async def test_share_endpoint_rejects_nonsense_coordinates(client, r):
    request_id = await lr.create(r, PASSENGER, asked_by=OPERATOR)

    resp = client.post(
        f"/location-requests/{request_id}/share",
        json={"lat": 999, "lng": 64.4215},
    )

    assert resp.status_code == 422
    assert (await lr.get(r, request_id))["status"] == lr.STATUS_PENDING


async def test_someone_elses_request_is_a_404(client, r):
    request_id = await lr.create(r, OTHER, asked_by=OPERATOR)

    assert client.get(f"/location-requests/{request_id}").status_code == 404
    resp = client.post(
        f"/location-requests/{request_id}/share",
        json={"lat": 39.7, "lng": 64.4},
    )
    assert resp.status_code == 404
    # ...and it is still waiting for the passenger it was actually meant for.
    assert (await lr.get(r, request_id))["status"] == lr.STATUS_PENDING


async def test_decline_endpoint_reports_the_refusal(client, r):
    request_id = await lr.create(r, PASSENGER, asked_by=OPERATOR)

    resp = client.post(f"/location-requests/{request_id}/decline")

    assert resp.status_code == 200
    assert (await lr.get(r, request_id))["status"] == lr.STATUS_DECLINED


async def test_re_asking_retires_the_previous_request(r):
    """Otherwise a stale notification could be answered onto an id nobody is
    watching, and the operator would wait forever on a passenger who shared."""
    first = await lr.create(r, PASSENGER, asked_by=OPERATOR)
    r.now += lr.COOLDOWN_SECONDS + 1
    second = await lr.create(r, PASSENGER, asked_by=OPERATOR)

    assert await lr.get(r, first) is None
    assert (await lr.get(r, second))["status"] == lr.STATUS_PENDING
    with pytest.raises(lr.LocationRequestError):
        await lr.answer(r, first, PASSENGER, lat=39.7, lng=64.4)


async def test_re_asking_leaves_another_passenger_alone(r):
    mine = await lr.create(r, PASSENGER, asked_by=OPERATOR)
    theirs = await lr.create(r, OTHER, asked_by=OPERATOR)
    r.now += lr.COOLDOWN_SECONDS + 1
    await lr.create(r, PASSENGER, asked_by=OPERATOR)

    assert await lr.get(r, mine) is None
    assert (await lr.get(r, theirs))["status"] == lr.STATUS_PENDING
