"""WebSocket auth helper — resolve a user from a ``?token=`` query param."""
from __future__ import annotations

import uuid

from fastapi import WebSocket, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import safe_decode
from app.models import User


async def authenticate_ws(ws: WebSocket, db: AsyncSession) -> User | None:
    """Validate the JWT supplied as a query param. Closes the socket and returns
    None on failure."""
    token = ws.query_params.get("token")
    if not token:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return None
    payload = safe_decode(token)
    if payload is None or payload.get("type") != "access":
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return None
    try:
        user = await db.get(User, uuid.UUID(payload["sub"]))
    except (KeyError, ValueError):
        user = None
    if user is None or user.is_blocked or not user.is_active:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return None
    return user
