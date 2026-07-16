"""Auth request/response schemas."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel, PhoneMixin


class RequestOTP(PhoneMixin):
    pass


class RequestOTPResponse(BaseModel):
    detail: str = "OTP sent"
    expires_in: int
    # Only populated when OTP_DEBUG_RETURN is true (dev convenience).
    debug_code: str | None = None


class VerifyOTP(PhoneMixin):
    code: str = Field(..., min_length=4, max_length=8)
    # Optional — supplied on first login so we can create the user.
    full_name: str | None = Field(default=None, max_length=100)
    role: str = Field(default="passenger")


class UserPublic(ORMModel):
    id: uuid.UUID
    phone: str
    full_name: str
    # Primary role. Note: this does NOT gate the passenger app — every
    # non-admin account can order rides. Driving is gated by ``is_driver``.
    role: str
    avatar_url: str | None = None
    is_active: bool
    is_blocked: bool
    # True once the account has a driver profile (any status), so the app can
    # offer the passenger/driver mode switcher.
    is_driver: bool = False
    # pending | approved | rejected | suspended — None if not a driver.
    driver_status: str | None = None


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserPublic


class RefreshRequest(BaseModel):
    refresh_token: str


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=100)
    avatar_url: str | None = Field(default=None, max_length=255)
