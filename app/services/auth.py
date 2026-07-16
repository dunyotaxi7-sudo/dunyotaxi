"""Auth service: user lookup/creation and token issuance."""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, create_refresh_token
from app.models import Driver, User, Wallet

VALID_ROLES = {"passenger", "driver", "admin"}


async def public_user(db: AsyncSession, user: User) -> dict:
    """User fields for the API, plus driver capability.

    Every non-admin account can ride as a passenger; ``is_driver`` says whether
    it can *also* drive, so the app can offer the mode switcher.
    """
    driver = (await db.execute(
        select(Driver).where(Driver.user_id == user.id)
    )).scalar_one_or_none()
    return {
        "id": user.id,
        "phone": user.phone,
        "full_name": user.full_name,
        "role": user.role,
        "avatar_url": user.avatar_url,
        "is_active": user.is_active,
        "is_blocked": user.is_blocked,
        "is_driver": driver is not None,
        "driver_status": driver.status if driver else None,
    }


async def get_user_by_phone(db: AsyncSession, phone: str) -> User | None:
    res = await db.execute(select(User).where(User.phone == phone))
    return res.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await db.get(User, user_id)


async def get_or_create_user(
    db: AsyncSession, phone: str, full_name: str | None, role: str
) -> tuple[User, bool]:
    """Return (user, created). Creates a wallet for new users."""
    user = await get_user_by_phone(db, phone)
    if user is not None:
        return user, False

    if role not in VALID_ROLES or role == "admin":
        # Admins are provisioned out-of-band, never via public OTP signup.
        role = "passenger"

    user = User(
        phone=phone,
        full_name=full_name or "Yangi foydalanuvchi",
        role=role,
    )
    db.add(user)
    await db.flush()  # populate user.id

    db.add(Wallet(user_id=user.id))
    await db.flush()
    return user, True


def issue_tokens(user: User) -> tuple[str, str]:
    return (
        create_access_token(str(user.id), user.role),
        create_refresh_token(str(user.id), user.role),
    )
