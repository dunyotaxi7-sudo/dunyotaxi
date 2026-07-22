"""Create (or promote) an approved driver — for testing and seeding.

The normal way to become a driver is the in-app flow: register, upload four
documents, wait for an admin to approve. That's slow when you just need a
working driver to exercise dispatch, so this creates one already approved:

    python -m scripts.create_driver +998901234567 "Ali Valiyev" "Chevrolet Cobalt" "01 A 123 BA"

Re-running for the same phone updates the car details and re-approves rather
than failing, so it's safe to repeat.
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models import Driver, User, Wallet


async def main(phone: str, full_name: str, car_model: str, car_number: str) -> None:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.phone == phone))
        user = res.scalar_one_or_none()

        if user is None:
            user = User(phone=phone, full_name=full_name, role="driver")
            db.add(user)
            await db.flush()
            db.add(Wallet(user_id=user.id))
            print(f"created user {user.id}")
        elif user.role == "admin":
            # Same rule the API enforces: promoting an admin would revoke their
            # panel access, so refuse rather than half-register them.
            print(f"refusing: {phone} is an admin account — use a different number")
            raise SystemExit(1)
        else:
            user.role = "driver"
            print(f"promoted existing user {user.id} to driver")

        res = await db.execute(select(Driver).where(Driver.user_id == user.id))
        driver = res.scalar_one_or_none()
        if driver is None:
            driver = Driver(
                user_id=user.id,
                car_model=car_model,
                car_number=car_number,
                status="approved",
            )
            db.add(driver)
            print("created driver profile (approved)")
        else:
            driver.car_model = car_model
            driver.car_number = car_number
            driver.status = "approved"
            print(f"updated driver profile {driver.id} (approved)")

        await db.commit()
        print(f"done — sign in as {phone}")


if __name__ == "__main__":
    if len(sys.argv) < 5:
        print(
            "usage: python -m scripts.create_driver "
            '<+998...> <full name> <car model> <car number>'
        )
        raise SystemExit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]))
