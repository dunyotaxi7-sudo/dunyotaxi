"""A phone number is either a driver's or a passenger's, never both.

The rule is enforced from both sides, because either side can come first: a
passenger can try to register as a driver, and a driver can try to order a
ride. Both gates key off history and profile rather than ``users.role``, since
role only records what the number was first registered as.
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import driver as driver_service


class FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value

    def scalar(self):
        return self._value


class FakeDB:
    """Answers the two queries the gates make, in call order."""

    def __init__(self, *answers):
        self._answers = list(answers)
        self.calls = 0

    async def execute(self, _stmt):
        self.calls += 1
        return FakeResult(self._answers.pop(0))


async def test_a_number_that_drives_is_recognised():
    db = FakeDB(SimpleNamespace(id="driver-1"))
    assert await driver_service.has_driver_profile(db, "user-1") is True


async def test_a_number_that_does_not_drive_is_recognised():
    db = FakeDB(None)
    assert await driver_service.has_driver_profile(db, "user-1") is False


async def test_ride_history_is_recognised():
    db = FakeDB(3)
    assert await driver_service.has_ordered_rides(db, "user-1") is True


async def test_no_ride_history_is_recognised():
    db = FakeDB(0)
    assert await driver_service.has_ordered_rides(db, "user-1") is False


async def test_a_passenger_who_has_ridden_cannot_register_as_a_driver():
    """The number is already a passenger's — they must use another one."""
    db = FakeDB(2)  # has_ordered_rides → 2 rides
    user = SimpleNamespace(id="user-1", role="passenger")

    with pytest.raises(driver_service.DriverError) as exc:
        await driver_service.register_driver(db, user, SimpleNamespace())

    assert "boshqa raqamdan" in str(exc.value)
    # Refused before the role was promoted — no half-changed account left over.
    assert user.role == "passenger"


async def test_an_admin_is_still_refused_before_the_history_check():
    """Admins were already refused; that must not have been displaced."""
    db = FakeDB()  # no queries should be made at all
    user = SimpleNamespace(id="user-1", role="admin")

    with pytest.raises(driver_service.DriverError):
        await driver_service.register_driver(db, user, SimpleNamespace())

    assert db.calls == 0
