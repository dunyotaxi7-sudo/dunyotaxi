"""Fixed-window rate limiting backed by Redis.

Simple INCR + EXPIRE counters. Good enough for abuse control (OTP/SMS spend);
not a precise sliding window. Each key counts hits within its own TTL window.
"""
from __future__ import annotations

import redis.asyncio as redis


async def hit(
    r: redis.Redis, key: str, limit: int, window_seconds: int
) -> tuple[bool, int]:
    """Record one hit against ``key``.

    Returns ``(allowed, retry_after_seconds)``. When the limit is exceeded,
    ``retry_after`` is how long until the window resets.
    """
    count = await r.incr(key)
    if count == 1:
        # First hit in this window — start the clock.
        await r.expire(key, window_seconds)
    if count > limit:
        ttl = await r.ttl(key)
        # -1 = no TTL (shouldn't happen), -2 = key vanished mid-call.
        return False, max(ttl, 1) if ttl and ttl > 0 else window_seconds
    return True, 0
