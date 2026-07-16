"""Push notifications via Expo's push service.

Device push tokens are kept in Redis (a set per user, so multiple devices work)
rather than the DB — no schema change, and tokens are cheap to re-register. For
a production system you'd also persist them, but this keeps the build simple.
"""
from __future__ import annotations

import logging

import httpx
import redis.asyncio as redis

log = logging.getLogger("push")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def push_tokens_key(user_id: str) -> str:
    return f"push:tokens:{user_id}"


async def register_token(r: redis.Redis, user_id: str, token: str) -> None:
    await r.sadd(push_tokens_key(user_id), token)


async def remove_token(r: redis.Redis, user_id: str, token: str) -> None:
    await r.srem(push_tokens_key(user_id), token)


async def get_tokens(r: redis.Redis, user_id: str) -> list[str]:
    return list(await r.smembers(push_tokens_key(user_id)))


def _looks_like_expo_token(token: str) -> bool:
    return token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken[")


async def send_to_user(
    r: redis.Redis,
    user_id: str,
    title: str,
    body: str,
    data: dict | None = None,
) -> None:
    """Best-effort push to all of a user's devices. Never raises."""
    try:
        tokens = await get_tokens(r, user_id)
        tokens = [t for t in tokens if _looks_like_expo_token(t)]
        if not tokens:
            return
        messages = [
            {
                "to": t,
                "title": title,
                "body": body,
                "sound": "default",
                "data": data or {},
                "priority": "high",
            }
            for t in tokens
        ]
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={"Content-Type": "application/json"},
            )
        # Drop tokens Expo reports as invalid (DeviceNotRegistered).
        await _prune_invalid(r, user_id, tokens, resp)
    except Exception:  # noqa: BLE001 — push must never break a ride transition
        log.exception("push send failed for user %s", user_id)


async def _prune_invalid(
    r: redis.Redis, user_id: str, tokens: list[str], resp: httpx.Response
) -> None:
    try:
        payload = resp.json()
    except Exception:  # noqa: BLE001
        return
    receipts = payload.get("data")
    if not isinstance(receipts, list):
        return
    for token, receipt in zip(tokens, receipts):
        err = (receipt or {}).get("details", {}).get("error")
        if err == "DeviceNotRegistered":
            await remove_token(r, user_id, token)
