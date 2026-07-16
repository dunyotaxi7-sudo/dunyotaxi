"""Auth router: OTP request/verify, token refresh, current user."""
from __future__ import annotations

import uuid

import redis.asyncio as redis
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import client_ip, get_current_user, get_redis_dep
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    safe_decode,
)
from app.models import User
from app.schemas.auth import (
    ProfileUpdate,
    RefreshRequest,
    RequestOTP,
    RequestOTPResponse,
    TokenPair,
    UserPublic,
    VerifyOTP,
)
from app.services import auth as auth_service
from app.services import otp as otp_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/request-otp", response_model=RequestOTPResponse)
async def request_otp(
    payload: RequestOTP,
    request: Request,
    db: AsyncSession = Depends(get_db),
    r: redis.Redis = Depends(get_redis_dep),
):
    # Don't spend real SMS on an account that can't log in anyway.
    existing = await auth_service.get_user_by_phone(db, payload.phone)
    if existing is not None and (existing.is_blocked or not existing.is_active):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hisob bloklangan.")
    try:
        ttl, debug_code = await otp_service.request_otp(
            r, payload.phone, client_ip(request)
        )
    except otp_service.OTPRateLimited as e:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Juda ko'p urinish. {e.retry_after} soniyadan so'ng qayta urining.",
            headers={"Retry-After": str(e.retry_after)},
        )
    except otp_service.OTPDeliveryFailed:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="SMS yuborib bo'lmadi. Keyinroq urinib ko'ring.",
        )
    return RequestOTPResponse(expires_in=ttl, debug_code=debug_code)


@router.post("/verify-otp", response_model=TokenPair)
async def verify_otp(
    payload: VerifyOTP,
    db: AsyncSession = Depends(get_db),
    r: redis.Redis = Depends(get_redis_dep),
):
    try:
        await otp_service.verify_otp(r, payload.phone, payload.code)
    except otp_service.OTPNotFound:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "OTP expired or not requested")
    except otp_service.OTPTooManyAttempts:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too many attempts")
    except otp_service.OTPMismatch:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid code")

    user, _created = await auth_service.get_or_create_user(
        db, payload.phone, payload.full_name, payload.role
    )
    if user.is_blocked or not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "account blocked")

    access, refresh = auth_service.issue_tokens(user)
    return TokenPair(
        access_token=access,
        refresh_token=refresh,
        user=UserPublic(**await auth_service.public_user(db, user)),
    )


@router.post("/refresh", response_model=TokenPair)
async def refresh_tokens(
    payload: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    data = safe_decode(payload.refresh_token)
    if data is None or data.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid refresh token")
    user = await db.get(User, uuid.UUID(data["sub"]))
    if user is None or user.is_blocked or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user unavailable")
    return TokenPair(
        access_token=create_access_token(str(user.id), user.role),
        refresh_token=create_refresh_token(str(user.id), user.role),
        user=UserPublic(**await auth_service.public_user(db, user)),
    )


@router.get("/me", response_model=UserPublic)
async def me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return UserPublic(**await auth_service.public_user(db, user))


@router.patch("/me", response_model=UserPublic)
async def update_me(
    payload: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.avatar_url is not None:
        user.avatar_url = payload.avatar_url
    await db.commit()
    await db.refresh(user)
    return UserPublic(**await auth_service.public_user(db, user))
