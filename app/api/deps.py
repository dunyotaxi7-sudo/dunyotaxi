"""Shared FastAPI dependencies: DB, Redis, current-user, role guards."""
from __future__ import annotations

import uuid

import redis.asyncio as redis
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis_client import get_redis as _get_redis
from app.core.security import safe_decode
from app.models import User
from app.services.driver import get_driver_by_user

bearer = HTTPBearer(auto_error=True)


async def get_redis_dep() -> redis.Redis:
    return _get_redis()


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = safe_decode(creds.credentials)
    if payload is None or payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token")
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "malformed token subject")

    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found")
    if user.is_blocked or not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "account blocked")
    return user


def require_role(*roles: str):
    async def _guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, f"requires role: {', '.join(roles)}"
            )
        return user

    return _guard


async def get_current_driver(
    user: User = Depends(require_role("driver")),
    db: AsyncSession = Depends(get_db),
):
    driver = await get_driver_by_user(db, user.id)
    if driver is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "driver profile not found")
    return driver


def client_ip(request) -> str | None:
    if request.client:
        return request.client.host
    return None
