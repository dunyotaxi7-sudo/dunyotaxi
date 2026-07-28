"""Operator staff schemas: login, management, permissions."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel

# The permission flags an admin toggles per operator. Everything else in the
# admin panel an operator can do by default.
PERMISSION_KEYS = ("deposit", "moderate_drivers", "finance")


class OperatorPermissions(BaseModel):
    deposit: bool = False           # top up / adjust driver balances
    moderate_drivers: bool = False  # approve/reject/suspend drivers + docs
    finance: bool = False           # commission, pricing, car-type multipliers


class OperatorLogin(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=1, max_length=200)


class OperatorPublic(ORMModel):
    id: uuid.UUID
    username: str | None = None
    full_name: str
    role: str
    is_active: bool
    permissions: OperatorPermissions = OperatorPermissions()


class OperatorTokenPair(BaseModel):
    access_token: str
    refresh_token: str
    operator: OperatorPublic


class OperatorCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=200)
    full_name: str = Field(..., min_length=1, max_length=100)
    permissions: OperatorPermissions = OperatorPermissions()


class OperatorUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=100)
    permissions: OperatorPermissions | None = None
    is_active: bool | None = None


class OperatorPasswordChange(BaseModel):
    password: str = Field(..., min_length=6, max_length=200)
