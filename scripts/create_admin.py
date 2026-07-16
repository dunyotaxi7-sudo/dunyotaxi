"""Create (or promote) an admin user.

Admins are never created via the public OTP flow, so use this once after the
DB is migrated:

    python -m scripts.create_admin +998901234567 "Bosh admin"
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models import User, Wallet


async def main(phone: str, full_name: str) -> None:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.phone == phone))
        user = res.scalar_one_or_none()
        if user is None:
            user = User(phone=phone, full_name=full_name, role="admin")
            db.add(user)
            await db.flush()
            db.add(Wallet(user_id=user.id))
            print(f"created admin {user.id}")
        else:
            user.role = "admin"
            print(f"promoted existing user {user.id} to admin")
        await db.commit()


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("usage: python -m scripts.create_admin <+998...> <full name>")
        raise SystemExit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2]))
