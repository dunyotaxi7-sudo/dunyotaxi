"""Operator staff: username/password auth + admin-managed CRUD.

Operators are ``users`` with ``role='operator'``. They sign in with a username
and password (not phone/OTP) and carry a ``permissions`` JSON of boolean flags.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models import User
from app.schemas.operator import PERMISSION_KEYS, OperatorPermissions


class OperatorError(Exception):
    pass


def _clean_perms(perms: OperatorPermissions | dict | None) -> dict:
    """Keep only known permission keys as plain bools."""
    src = perms.model_dump() if isinstance(perms, OperatorPermissions) else (perms or {})
    return {k: bool(src.get(k, False)) for k in PERMISSION_KEYS}


async def get_by_username(db: AsyncSession, username: str) -> User | None:
    res = await db.execute(select(User).where(User.username == username))
    return res.scalar_one_or_none()


async def authenticate(db: AsyncSession, username: str, password: str) -> User:
    """Verify credentials for an active operator. Raises OperatorError on failure."""
    user = await get_by_username(db, username.strip())
    if (
        user is None
        or user.role != "operator"
        or not verify_password(password, user.password_hash)
    ):
        raise OperatorError("Login yoki parol noto'g'ri")
    if user.is_blocked or not user.is_active:
        raise OperatorError("Hisob faol emas")
    return user


async def list_operators(db: AsyncSession) -> list[User]:
    res = await db.execute(
        select(User).where(User.role == "operator").order_by(User.created_at.desc())
    )
    return list(res.scalars())


async def create_operator(
    db: AsyncSession, *, username: str, password: str, full_name: str,
    permissions: OperatorPermissions,
) -> User:
    username = username.strip()
    if await get_by_username(db, username) is not None:
        raise OperatorError("Bu login band")
    user = User(
        phone=None,
        full_name=full_name.strip(),
        role="operator",
        username=username,
        password_hash=hash_password(password),
        permissions=_clean_perms(permissions),
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


async def _get_operator(db: AsyncSession, operator_id: uuid.UUID) -> User:
    user = await db.get(User, operator_id)
    if user is None or user.role != "operator":
        raise OperatorError("Operator topilmadi")
    return user


async def update_operator(
    db: AsyncSession, operator_id: uuid.UUID, payload
) -> User:
    user = await _get_operator(db, operator_id)
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.permissions is not None:
        user.permissions = _clean_perms(payload.permissions)
    if payload.is_active is not None:
        user.is_active = payload.is_active
    await db.flush()
    return user


async def set_password(db: AsyncSession, operator_id: uuid.UUID, password: str) -> User:
    user = await _get_operator(db, operator_id)
    user.password_hash = hash_password(password)
    await db.flush()
    return user
