"""Tests for OTP delivery + abuse limits (rate limiting, code leakage)."""
from __future__ import annotations

import pytest

from app.core.config import settings
from app.services import otp as otp_service
from app.services import sms as sms_service


class FakeRedis:
    """Minimal async Redis stand-in with a controllable clock, so TTL/cooldown
    behaviour can be tested without a live server."""

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

    async def get(self, key):
        item = self._alive(key)
        return item[0] if item else None

    async def set(self, key, value, ex=None):
        self.store[key] = [str(value), self.now + ex if ex else None]

    async def incr(self, key):
        item = self._alive(key)
        value = int(item[0]) + 1 if item else 1
        expires = item[1] if item else None
        self.store[key] = [str(value), expires]
        return value

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

    async def delete(self, *keys):
        for k in keys:
            self.store.pop(k, None)

    async def exists(self, key):
        return 1 if self._alive(key) else 0


PHONE = "+998901112233"
IP = "203.0.113.9"


@pytest.fixture
def r():
    return FakeRedis()


@pytest.fixture(autouse=True)
def _mock_provider(monkeypatch):
    """Default to the mock provider with generous limits; tests tighten as needed."""
    monkeypatch.setattr(settings, "sms_provider", "mock")
    monkeypatch.setattr(settings, "otp_debug_return", True)
    monkeypatch.setattr(settings, "otp_resend_cooldown_seconds", 60)
    monkeypatch.setattr(settings, "otp_max_per_phone_hour", 5)
    monkeypatch.setattr(settings, "otp_max_per_phone_day", 10)
    monkeypatch.setattr(settings, "otp_max_per_ip_hour", 20)


# ── Happy path ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_request_otp_mock_returns_debug_code(r):
    ttl, debug = await otp_service.request_otp(r, PHONE, IP)
    assert ttl == settings.otp_ttl_seconds
    assert debug is not None and len(debug) == settings.otp_length


@pytest.mark.asyncio
async def test_requested_code_verifies(r):
    _, code = await otp_service.request_otp(r, PHONE, IP)
    await otp_service.verify_otp(r, PHONE, code)  # no raise


# ── Rate limiting ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cooldown_blocks_immediate_resend(r):
    await otp_service.request_otp(r, PHONE, IP)
    with pytest.raises(otp_service.OTPRateLimited) as e:
        await otp_service.request_otp(r, PHONE, IP)
    assert 0 < e.value.retry_after <= 60


@pytest.mark.asyncio
async def test_resend_allowed_after_cooldown(r):
    await otp_service.request_otp(r, PHONE, IP)
    r.now += 61  # cooldown elapsed
    ttl, debug = await otp_service.request_otp(r, PHONE, IP)
    assert debug is not None


@pytest.mark.asyncio
async def test_hourly_phone_cap(r, monkeypatch):
    monkeypatch.setattr(settings, "otp_max_per_phone_hour", 3)
    for _ in range(3):
        await otp_service.request_otp(r, PHONE, IP)
        r.now += 61  # skip the cooldown so we hit the hourly cap
    with pytest.raises(otp_service.OTPRateLimited):
        await otp_service.request_otp(r, PHONE, IP)


@pytest.mark.asyncio
async def test_ip_cap_blocks_across_phones(r, monkeypatch):
    """One IP spraying different numbers is throttled."""
    monkeypatch.setattr(settings, "otp_max_per_ip_hour", 2)
    await otp_service.request_otp(r, "+998900000001", IP)
    await otp_service.request_otp(r, "+998900000002", IP)
    with pytest.raises(otp_service.OTPRateLimited):
        await otp_service.request_otp(r, "+998900000003", IP)


# ── Code leakage safety ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_real_provider_never_echoes_code(r, monkeypatch):
    """Even with OTP_DEBUG_RETURN left on, a real send must not leak the code."""
    monkeypatch.setattr(settings, "sms_provider", "eskiz")
    monkeypatch.setattr(settings, "otp_debug_return", True)

    async def fake_send(_r, _phone, _text):
        return None

    monkeypatch.setattr(sms_service, "send", fake_send)
    _, debug = await otp_service.request_otp(r, PHONE, IP)
    assert debug is None


# ── Delivery failure ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delivery_failure_stores_nothing(r, monkeypatch):
    monkeypatch.setattr(settings, "sms_provider", "eskiz")

    async def boom(_r, _phone, _text):
        raise sms_service.SMSError("gateway down")

    monkeypatch.setattr(sms_service, "send", boom)
    with pytest.raises(otp_service.OTPDeliveryFailed):
        await otp_service.request_otp(r, PHONE, IP)

    # No code stored and no cooldown burned — the user can retry.
    from app.core.redis_client import otp_cooldown_key, otp_key

    assert await r.get(otp_key(PHONE)) is None
    assert await r.get(otp_cooldown_key(PHONE)) is None


# ── Eskiz helpers ─────────────────────────────────────────────────────


def test_phone_normalized_for_eskiz():
    assert sms_service.normalize_phone("+998 90 111 22 33") == "998901112233"
    assert sms_service.normalize_phone("998901112233") == "998901112233"
