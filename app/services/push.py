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


def _chunks(items: list, size: int) -> list[list]:
    return [items[i:i + size] for i in range(0, len(items), size)]


async def send_bulk(
    r: redis.Redis,
    user_ids: list[str],
    title: str,
    body: str,
    data: dict | None = None,
) -> dict:
    """Push the same message to many users at once (admin broadcast).

    Returns a report so the operator can see the real reach: how many of the
    targeted users actually have a device registered, and how many messages
    Expo accepted. Never raises — a broadcast must not 500 the request.
    """
    token_owner: dict[str, str] = {}
    for uid in user_ids:
        for t in await get_tokens(r, uid):
            if _looks_like_expo_token(t):
                token_owner[t] = uid

    tokens = list(token_owner)
    report = {
        "users_total": len(user_ids),
        "users_with_token": len(set(token_owner.values())),
        "tokens": len(tokens),
        "sent": 0,
        "failed": 0,
    }
    if not tokens:
        return report

    # Expo accepts at most 100 messages per request.
    for chunk in _chunks(tokens, 100):
        messages = [
            {
                "to": t,
                "title": title,
                "body": body,
                "sound": "default",
                "data": data or {},
                "priority": "high",
                "channelId": "default",
            }
            for t in chunk
        ]
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    EXPO_PUSH_URL,
                    json=messages,
                    headers={"Content-Type": "application/json"},
                )
            payload = resp.json() if resp.status_code == 200 else {}
            tickets = payload.get("data") or []
            for tok, ticket in zip(chunk, tickets):
                if ticket.get("status") == "ok":
                    report["sent"] += 1
                else:
                    report["failed"] += 1
                    # Expo tells us when a device is gone; drop those tokens.
                    if (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
                        await remove_token(r, token_owner[tok], tok)
            if len(tickets) < len(chunk):
                report["failed"] += len(chunk) - len(tickets)
        except Exception:  # noqa: BLE001
            log.exception("broadcast chunk failed (%d tokens)", len(chunk))
            report["failed"] += len(chunk)

    return report


async def count_registered(r: redis.Redis, user_ids: list[str]) -> int:
    """How many of these users have at least one usable device token."""
    n = 0
    for uid in user_ids:
        if any(_looks_like_expo_token(t) for t in await get_tokens(r, uid)):
            n += 1
    return n
