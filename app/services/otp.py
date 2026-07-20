"""OTP generation, storage (Redis, 2-min TTL), delivery and verification.

Abuse controls (SMS costs money, and spamming someone's phone is harassment):
  * a resend cooldown per phone,
  * hourly + daily caps per phone,
  * an hourly cap per client IP,
  * a wrong-code attempt cap (see :func:`verify_otp`).
"""
from __future__ import annotations

import hashlib
import logging
import secrets

import redis.asyncio as redis

from app.core.config import settings
from app.core.redis_client import (
    otp_attempts_key,
    otp_cooldown_key,
    otp_key,
    rate_key,
)
from app.services import ratelimit
from app.services import sms as sms_service

log = logging.getLogger("otp")


class OTPError(Exception):
    """Base OTP failure."""


class OTPNotFound(OTPError):
    pass


class OTPMismatch(OTPError):
    pass


class OTPTooManyAttempts(OTPError):
    pass


class OTPRateLimited(OTPError):
    """Too many code requests — retry after ``retry_after`` seconds."""

    def __init__(self, retry_after: int) -> None:
        super().__init__(f"rate limited; retry in {retry_after}s")
        self.retry_after = retry_after


class OTPDeliveryFailed(OTPError):
    """The SMS gateway rejected or could not deliver the code."""


def _hash(code: str) -> str:
    """Store a hash, not the raw code."""
    return hashlib.sha256(f"{settings.jwt_secret}:{code}".encode()).hexdigest()


def generate_code() -> str:
    upper = 10**settings.otp_length
    return str(secrets.randbelow(upper)).zfill(settings.otp_length)


async def _enforce_limits(r: redis.Redis, phone: str, ip: str | None) -> None:
    """Raise :class:`OTPRateLimited` if this request is abusive."""
    # 1) Resend cooldown — one code per phone per cooldown window.
    cooldown = otp_cooldown_key(phone)
    ttl = await r.ttl(cooldown)
    if ttl and ttl > 0:
        raise OTPRateLimited(ttl)

    # 2) Per-phone caps, then per-IP cap.
    windows: list[tuple[str, int, int]] = [
        (rate_key("otp:phone:h", phone), settings.otp_max_per_phone_hour, 3600),
        (rate_key("otp:phone:d", phone), settings.otp_max_per_phone_day, 86400),
    ]
    if ip:
        windows.append(
            (rate_key("otp:ip:h", ip), settings.otp_max_per_ip_hour, 3600)
        )
    for key, limit, window in windows:
        allowed, retry_after = await ratelimit.hit(r, key, limit, window)
        if not allowed:
            log.warning("otp rate limit hit: key=%s phone=%s ip=%s", key, phone, ip)
            raise OTPRateLimited(retry_after)


async def request_otp(
    r: redis.Redis, phone: str, ip: str | None = None
) -> tuple[int, str | None]:
    """Generate, send and store an OTP. Returns (ttl, debug_code|None).

    Raises :class:`OTPRateLimited` or :class:`OTPDeliveryFailed`.
    """
    await _enforce_limits(r, phone, ip)

    # Allow-listed test numbers (store reviewers / QA) get a fixed code and no
    # SMS. Everything else — hashing, TTL, attempt limits — stays identical.
    fixed = settings.otp_test_phones.get(phone)
    if fixed is not None:
        log.warning("otp: test-phone allowlist hit for %s — no SMS sent", phone)
        code = fixed
    else:
        code = generate_code()
        text = settings.otp_message_template.format(code=code)
        try:
            await sms_service.send(r, phone, text)
        except sms_service.SMSError as e:
            # Never log the code itself.
            log.error("otp delivery failed for %s: %s", phone, e)
            raise OTPDeliveryFailed(str(e)) from e

    # Only store/start the cooldown once the SMS is actually away.
    await r.set(otp_key(phone), _hash(code), ex=settings.otp_ttl_seconds)
    await r.delete(otp_attempts_key(phone))
    await r.set(
        otp_cooldown_key(phone), "1", ex=settings.otp_resend_cooldown_seconds
    )

    # Safety net: only ever echo the code back when nothing real was sent, even
    # if OTP_DEBUG_RETURN is left on by mistake in production.
    debug = (
        code
        if settings.otp_debug_return and settings.sms_provider == "mock"
        else None
    )
    return settings.otp_ttl_seconds, debug


async def verify_otp(r: redis.Redis, phone: str, code: str) -> None:
    """Validate the submitted code. Raises an ``OTPError`` subclass on failure."""
    stored = await r.get(otp_key(phone))
    if stored is None:
        raise OTPNotFound("OTP expired or never requested")

    attempts = await r.incr(otp_attempts_key(phone))
    # Keep the attempts counter tied to the OTP lifetime.
    if attempts == 1:
        await r.expire(otp_attempts_key(phone), settings.otp_ttl_seconds)
    if attempts > settings.otp_max_attempts:
        await r.delete(otp_key(phone))
        raise OTPTooManyAttempts("too many attempts; request a new code")

    if not secrets.compare_digest(stored, _hash(code)):
        raise OTPMismatch("invalid code")

    # Success — consume the code so it can't be reused.
    await r.delete(otp_key(phone))
    await r.delete(otp_attempts_key(phone))
