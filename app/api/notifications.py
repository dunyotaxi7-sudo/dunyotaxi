"""Push-token registration for the mobile apps."""
from __future__ import annotations

import redis.asyncio as redis
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import get_current_user, get_redis_dep
from app.models import User
from app.services import push

router = APIRouter(prefix="/notifications", tags=["notifications"])


class PushTokenIn(BaseModel):
    token: str = Field(..., min_length=1, max_length=255)


@router.post("/register-token")
async def register_token(
    payload: PushTokenIn,
    user: User = Depends(get_current_user),
    r: redis.Redis = Depends(get_redis_dep),
):
    await push.register_token(r, str(user.id), payload.token)
    return {"detail": "registered"}


@router.delete("/token")
async def unregister_token(
    payload: PushTokenIn,
    user: User = Depends(get_current_user),
    r: redis.Redis = Depends(get_redis_dep),
):
    await push.remove_token(r, str(user.id), payload.token)
    return {"detail": "removed"}
