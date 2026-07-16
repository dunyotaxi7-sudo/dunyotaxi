"""Redis connection helpers.

Redis is used for two things in this project:
  * OTP codes          — key ``otp:<phone>`` with a short TTL.
  * Live driver GPS    — geo set ``drivers:online`` populated with GEOADD.
"""
from __future__ import annotations

import redis.asyncio as redis

from app.core.config import settings

# Keys used across the app.
DRIVERS_GEO_KEY = "drivers:online"


def otp_key(phone: str) -> str:
    return f"otp:{phone}"


def otp_attempts_key(phone: str) -> str:
    return f"otp:attempts:{phone}"


def otp_cooldown_key(phone: str) -> str:
    """Blocks re-requesting a code too quickly."""
    return f"otp:cooldown:{phone}"


def rate_key(scope: str, ident: str) -> str:
    """Fixed-window abuse counter, e.g. rate_key('otp:phone:hour', '+998...')."""
    return f"rl:{scope}:{ident}"


# Cached Eskiz.uz bearer token (their token lives ~30 days).
ESKIZ_TOKEN_KEY = "sms:eskiz:token"


def driver_meta_key(driver_id: str) -> str:
    """Hash holding a driver's last-seen heading/bearing/timestamp."""
    return f"driver:meta:{driver_id}"


_pool: redis.Redis | None = None


def get_redis() -> redis.Redis:
    """Return a lazily-created, shared async Redis client."""
    global _pool
    if _pool is None:
        _pool = redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _pool


async def close_redis() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None
