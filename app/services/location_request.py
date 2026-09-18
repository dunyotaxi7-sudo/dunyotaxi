"""Operator → passenger location requests.

A passenger who orders by phone never opens the app, so the operator has no
pickup point to work with. This is the round-trip that gets them one: the
operator asks, the passenger's phone receives a push, they tap it, the app
takes a single GPS fix and posts it back here, and the operator's panel — which
polls the request — drops the pin on the map.

The tap is the consent. We never take a fix the passenger did not agree to, so
there is no silent/background path here by design; ``declined`` is a first-class
answer the operator sees.

Requests live in Redis only. They are worthless minutes later, they must not
outlive the call they belong to, and keeping them out of Postgres means no
schema change and no stale location data lying around.
"""
from __future__ import annotations

import time
import uuid

import redis.asyncio as redis

from app.core.redis_client import (
    location_request_cooldown_key,
    location_request_key,
    location_request_latest_key,
)

# Long enough for a passenger to notice the push, unlock, and tap; short enough
# that a forgotten request can't be answered after the call is over.
REQUEST_TTL_SECONDS = 600
# Stops an impatient operator from firing off ten pushes in ten seconds.
COOLDOWN_SECONDS = 20

# An order's ``from_address`` is 200 chars; a label longer than that would be
# rejected later, so it is cut here instead of at the point of no return.
MAX_ADDRESS_CHARS = 200

STATUS_PENDING = "pending"
STATUS_SHARED = "shared"
STATUS_DECLINED = "declined"


class LocationRequestError(Exception):
    """The request is missing, expired, already answered, or not this user's."""


async def cooldown_left(r: redis.Redis, user_id: str) -> int:
    """Seconds until this passenger may be asked again (0 = ask away)."""
    ttl = await r.ttl(location_request_cooldown_key(user_id))
    return ttl if ttl and ttl > 0 else 0


async def create(r: redis.Redis, user_id: str, *, asked_by: str) -> str:
    """Open a pending request for ``user_id`` and return its id.

    Asking again retires the passenger's previous request. Otherwise a stale
    notification sitting in their tray would still be answerable, and that
    answer would land on an id the operator is no longer watching — they would
    tap "share" and the operator would go on seeing nothing.
    """
    latest_key = location_request_latest_key(user_id)
    previous = await r.get(latest_key)
    if previous:
        await r.delete(location_request_key(previous))

    request_id = uuid.uuid4().hex
    key = location_request_key(request_id)
    await r.hset(
        key,
        mapping={
            "user_id": user_id,
            "asked_by": asked_by,
            "status": STATUS_PENDING,
            "created_at": str(int(time.time())),
        },
    )
    await r.expire(key, REQUEST_TTL_SECONDS)
    await r.set(latest_key, request_id, ex=REQUEST_TTL_SECONDS)
    await r.set(
        location_request_cooldown_key(user_id), "1", ex=COOLDOWN_SECONDS
    )
    return request_id


def _parse(raw: dict) -> dict:
    """Redis hands back strings; give callers real types."""
    out: dict = {
        "user_id": raw.get("user_id", ""),
        "asked_by": raw.get("asked_by", ""),
        "status": raw.get("status", STATUS_PENDING),
        "address": raw.get("address") or None,
        "lat": None,
        "lng": None,
        "accuracy_m": None,
        "answered_at": None,
    }
    for field, cast in (("lat", float), ("lng", float), ("accuracy_m", float),
                        ("answered_at", int)):
        value = raw.get(field)
        if value not in (None, ""):
            try:
                out[field] = cast(value)
            except ValueError:  # corrupt entry — treat as absent
                pass
    return out


async def get(r: redis.Redis, request_id: str) -> dict | None:
    """The request as stored, or None if it never existed / has expired."""
    raw = await r.hgetall(location_request_key(request_id))
    return _parse(raw) if raw else None


async def _owned_pending(r: redis.Redis, request_id: str, user_id: str) -> dict:
    """Load a request, insisting it is this passenger's and still open."""
    req = await get(r, request_id)
    if req is None:
        raise LocationRequestError("So'rov topilmadi yoki muddati tugagan")
    if req["user_id"] != user_id:
        # Don't leak whose request it is — same message as a missing one.
        raise LocationRequestError("So'rov topilmadi yoki muddati tugagan")
    if req["status"] != STATUS_PENDING:
        raise LocationRequestError("Bu so'rovga allaqachon javob berilgan")
    return req


async def answer(
    r: redis.Redis,
    request_id: str,
    user_id: str,
    *,
    lat: float,
    lng: float,
    address: str | None = None,
    accuracy_m: float | None = None,
) -> dict:
    """Record the passenger's fix. Raises :class:`LocationRequestError`."""
    await _owned_pending(r, request_id, user_id)
    key = location_request_key(request_id)
    mapping = {
        "status": STATUS_SHARED,
        "lat": str(lat),
        "lng": str(lng),
        "answered_at": str(int(time.time())),
    }
    if address:
        mapping["address"] = address[:MAX_ADDRESS_CHARS]
    if accuracy_m is not None:
        mapping["accuracy_m"] = str(accuracy_m)
    await r.hset(key, mapping=mapping)
    # Keep the answer readable for the rest of the original window only.
    await r.expire(key, REQUEST_TTL_SECONDS)
    return await get(r, request_id) or {}


async def decline(r: redis.Redis, request_id: str, user_id: str) -> None:
    """The passenger said no — tell the operator instead of leaving them waiting."""
    await _owned_pending(r, request_id, user_id)
    key = location_request_key(request_id)
    await r.hset(
        key,
        mapping={
            "status": STATUS_DECLINED,
            "answered_at": str(int(time.time())),
        },
    )
    await r.expire(key, REQUEST_TTL_SECONDS)
