"""SMS delivery.

Providers:
  * ``mock``  — logs the message (development only).
  * ``eskiz`` — Eskiz.uz gateway (https://notify.eskiz.uz/api).

Eskiz contract:
    POST  /auth/login          {email, password}          -> {"data": {"token": ...}}
    PATCH /auth/refresh        (Bearer)                   -> refreshed token
    POST  /message/sms/send    (Bearer) {mobile_phone, message, from}
                                                          -> {"id", "status", ...}

Their bearer token lives ~30 days, so we cache it in Redis (shared across
workers, survives restarts) and transparently re-login on a 401.

IMPORTANT: Eskiz moderates message content — the OTP text you send must match a
template approved in your Eskiz account, otherwise sends are rejected. Configure
it via ``OTP_MESSAGE_TEMPLATE`` and get that exact wording approved.
"""
from __future__ import annotations

import logging

import httpx
import redis.asyncio as redis

from app.core.config import settings
from app.core.redis_client import ESKIZ_TOKEN_KEY

log = logging.getLogger("sms")

# Refresh well before Eskiz's ~30-day expiry.
_TOKEN_TTL_SECONDS = 25 * 24 * 3600
_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


class SMSError(Exception):
    """SMS could not be delivered."""


def normalize_phone(phone: str) -> str:
    """Eskiz expects 998XXXXXXXXX — no '+', no spaces."""
    return phone.replace(" ", "").replace("-", "").lstrip("+")


async def _login(client: httpx.AsyncClient) -> str:
    if not settings.eskiz_email or not settings.eskiz_password:
        raise SMSError("eskiz credentials are not configured")
    resp = await client.post(
        f"{settings.eskiz_base_url}/auth/login",
        data={"email": settings.eskiz_email, "password": settings.eskiz_password},
    )
    if resp.status_code >= 400:
        raise SMSError(f"eskiz login failed: {resp.status_code} {resp.text[:200]}")
    try:
        return resp.json()["data"]["token"]
    except (KeyError, TypeError, ValueError) as e:
        raise SMSError(f"eskiz login: unexpected response ({e})")


async def _token(r: redis.Redis, client: httpx.AsyncClient, *, force: bool = False) -> str:
    """Bearer token for Eskiz.

    Preferred: email + password → we log in and cache/renew the token forever.
    Fallback: a pre-issued ESKIZ_TOKEN — works, but expires in ~30 days and
    cannot renew itself, so it will need manual rotation.
    """
    if settings.eskiz_email and settings.eskiz_password:
        if not force:
            cached = await r.get(ESKIZ_TOKEN_KEY)
            if cached:
                return cached
        token = await _login(client)
        await r.set(ESKIZ_TOKEN_KEY, token, ex=_TOKEN_TTL_SECONDS)
        return token

    if settings.eskiz_token:
        if force:
            raise SMSError(
                "eskiz: ESKIZ_TOKEN was rejected (likely expired). Set "
                "ESKIZ_EMAIL + ESKIZ_PASSWORD so the token renews automatically."
            )
        return settings.eskiz_token

    raise SMSError(
        "eskiz: no credentials — set ESKIZ_EMAIL + ESKIZ_PASSWORD (preferred), "
        "or ESKIZ_TOKEN"
    )


async def _post_sms(
    client: httpx.AsyncClient, token: str, phone: str, text: str
) -> httpx.Response:
    return await client.post(
        f"{settings.eskiz_base_url}/message/sms/send",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "mobile_phone": normalize_phone(phone),
            "message": text,
            "from": settings.eskiz_from,
        },
    )


async def _send_eskiz(r: redis.Redis, phone: str, text: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            token = await _token(r, client)
            resp = await _post_sms(client, token, phone, text)
            if resp.status_code == 401:
                # Token expired/revoked — re-login once and retry.
                token = await _token(r, client, force=True)
                resp = await _post_sms(client, token, phone, text)
            if resp.status_code >= 400:
                raise SMSError(
                    f"eskiz send failed: {resp.status_code} {resp.text[:200]}"
                )
    except httpx.HTTPError as e:
        raise SMSError(f"eskiz transport error: {e}") from e


async def send(r: redis.Redis, phone: str, text: str) -> None:
    """Deliver an SMS. Raises :class:`SMSError` if it can't be sent."""
    provider = settings.sms_provider
    if provider == "mock":
        log.info("[MOCK SMS] %s -> %s", phone, text)
        return
    if provider == "eskiz":
        await _send_eskiz(r, phone, text)
        return
    raise SMSError(f"unknown sms provider: {provider!r}")
