"""Saved places: a landmark stored under the name callers actually say.

The rules worth pinning down are the ones that protect a shared list every
operator can write to: one name means one place, and a pin only moves when a
whole coordinate is supplied.
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import admin as admin_service


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return self._rows


class FakeDB:
    """Answers queries in call order and records what was written."""

    def __init__(self, *answers, stored=None):
        self._answers = list(answers)
        self._stored = stored or {}
        self.added: list[object] = []
        self.deleted: list[object] = []
        self.committed = False

    async def execute(self, _stmt):
        return FakeResult(self._answers.pop(0) if self._answers else [])

    async def get(self, _model, key):
        return self._stored.get(key)

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = "new-id"

    async def delete(self, obj):
        self.deleted.append(obj)

    async def commit(self):
        self.committed = True


def a_place(**kw):
    base = dict(
        id="place-1",
        name="Sitorai Mohi Xosa",
        address="Buxoro, Sitora ko'chasi",
        location="SRID=4326;POINT(64.4400 39.8000)",
        is_active=True,
        created_at=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


# ── One name, one place ───────────────────────────────────────────────


async def test_a_duplicate_name_is_refused_before_it_reaches_the_index():
    """The operator gets a sentence, not a constraint error."""
    db = FakeDB([("place-1",)])  # name lookup finds an existing row

    with pytest.raises(ValueError) as exc:
        await admin_service.create_place(
            db, "admin-1", name="Sitorai Mohi Xosa", lat=39.8, lng=64.44
        )

    assert "allaqachon" in str(exc.value)
    assert db.added == []  # nothing half-written


async def test_the_name_check_ignores_case_and_padding():
    """"  sitorai mohi xosa  " is the same bazaar as "Sitorai Mohi Xosa"."""
    captured = {}

    class CapturingDB(FakeDB):
        async def execute(self, stmt):
            captured["sql"] = str(stmt)
            return FakeResult([])

    db = CapturingDB()
    assert await admin_service._place_name_taken(db, "  Sitorai Mohi Xosa  ") is False
    assert "lower" in captured["sql"].lower()


async def test_renaming_to_a_name_another_place_holds_is_refused():
    db = FakeDB([("place-2",)], stored={"place-1": a_place()})

    with pytest.raises(ValueError):
        await admin_service.update_place(
            db, "admin-1", "place-1", changes={"name": "Registon"}
        )


# ── Moving the pin ────────────────────────────────────────────────────


async def test_half_a_coordinate_does_not_move_the_pin():
    """A lat with no lng would drop the place in the sea."""
    place = a_place()
    original = place.location
    db = FakeDB([], stored={"place-1": place})

    await admin_service.update_place(
        db, "admin-1", "place-1", changes={"lat": 39.9, "lng": None}
    )

    assert place.location == original


async def test_a_full_coordinate_moves_the_pin():
    place = a_place()
    db = FakeDB([], stored={"place-1": place})

    await admin_service.update_place(
        db, "admin-1", "place-1", changes={"lat": 39.9, "lng": 64.5}
    )

    # PostGIS takes longitude first — the usual place to get this backwards.
    assert place.location == "SRID=4326;POINT(64.5 39.9)"


async def test_retiring_a_place_keeps_it_but_stops_offering_it():
    place = a_place()
    db = FakeDB([], stored={"place-1": place})

    await admin_service.update_place(
        db, "admin-1", "place-1", changes={"is_active": False}
    )

    assert place.is_active is False
    assert db.deleted == []


# ── Missing rows ──────────────────────────────────────────────────────


async def test_updating_a_place_that_is_gone_reports_it():
    db = FakeDB(stored={})
    assert await admin_service.update_place(
        db, "admin-1", "nope", changes={"name": "X"}
    ) is None


async def test_deleting_a_place_that_is_gone_reports_it():
    db = FakeDB(stored={})
    assert await admin_service.delete_place(db, "admin-1", "nope") is False


async def test_deleting_removes_the_row_outright():
    """Safe, because a ride copies the name rather than pointing at it."""
    place = a_place()
    db = FakeDB(stored={"place-1": place})

    assert await admin_service.delete_place(db, "admin-1", "place-1") is True
    assert db.deleted == [place]


# ── Shape handed to the panel ─────────────────────────────────────────


async def test_a_listed_place_carries_its_coordinates():
    place = a_place()
    db = FakeDB([(place, 39.8, 64.44)])

    rows = await admin_service.list_places(db, "sitora")

    assert rows == [{
        "id": "place-1",
        "name": "Sitorai Mohi Xosa",
        "address": "Buxoro, Sitora ko'chasi",
        "lat": 39.8,
        "lng": 64.44,
        "is_active": True,
        "created_at": None,
    }]
