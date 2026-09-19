"""A client's previous pickup points, offered for one-click reuse.

The value is in the deduplication: the same doorway geocodes to slightly
different coordinates each time, so grouping by point would fill the list with
one place repeated and bury the other two.
"""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from app.services import admin as admin_service


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class FakeDB:
    def __init__(self, rows):
        self._rows = rows

    async def execute(self, _stmt):
        return FakeResult(self._rows)


BASE = datetime(2026, 9, 19, 12, 0, 0)


def _ride(address, lat, lng, minutes_ago):
    return (address, lat, lng, BASE - timedelta(minutes=minutes_ago))


async def test_the_same_doorway_is_offered_once():
    """Three trips from home, geocoded slightly differently each time."""
    db = FakeDB([
        _ride("Mustaqillik ko'chasi, 12", 39.7681, 64.4215, 5),
        _ride("Mustaqillik ko'chasi, 12", 39.7682, 64.4216, 60),
        _ride("Mustaqillik ko'chasi, 12", 39.7680, 64.4214, 600),
        _ride("Navoiy ko'chasi, 4", 39.7750, 64.4300, 700),
    ])

    out = await admin_service.recent_pickups(db, "user-1")

    assert [p["address"] for p in out] == [
        "Mustaqillik ko'chasi, 12",
        "Navoiy ko'chasi, 4",
    ]
    # The coordinates kept are the most recent ones for that address.
    assert out[0]["lat"] == pytest.approx(39.7681)


async def test_most_recently_used_comes_first():
    db = FakeDB([
        _ride("Yangi manzil", 39.1, 64.1, 1),
        _ride("Eski manzil", 39.2, 64.2, 999),
    ])

    out = await admin_service.recent_pickups(db, "user-1")

    assert out[0]["address"] == "Yangi manzil"


async def test_it_stops_at_the_limit():
    db = FakeDB([_ride(f"Manzil {i}", 39.0 + i, 64.0 + i, i) for i in range(10)])

    assert len(await admin_service.recent_pickups(db, "user-1", limit=3)) == 3
    assert len(await admin_service.recent_pickups(db, "user-1", limit=5)) == 5


async def test_case_and_spacing_do_not_split_one_place_in_two():
    db = FakeDB([
        _ride("Mustaqillik ko'chasi, 12", 39.7681, 64.4215, 5),
        _ride("  mustaqillik KO'CHASI, 12 ", 39.7682, 64.4216, 60),
    ])

    assert len(await admin_service.recent_pickups(db, "user-1")) == 1


async def test_blank_addresses_are_skipped():
    """A ride whose address never resolved is no use as a button."""
    db = FakeDB([
        _ride("", 39.1, 64.1, 1),
        _ride(None, 39.2, 64.2, 2),
        _ride("Haqiqiy manzil", 39.3, 64.3, 3),
    ])

    out = await admin_service.recent_pickups(db, "user-1")

    assert [p["address"] for p in out] == ["Haqiqiy manzil"]


async def test_a_client_with_no_history_gets_nothing():
    assert await admin_service.recent_pickups(FakeDB([]), "user-1") == []
