"""An operator order with no destination is a metered order.

"Just drive, I'll direct him" is a normal call-centre request. There is no
destination to quote against, so the order carries no price until the meter
settles it at completion.
"""
from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from app.schemas.admin import AdminOrderCreate, OrderLocation
from app.services import service_area

PICKUP = OrderLocation(lat=39.7681, lng=64.4215, address="Buxoro, Mustaqillik")
DROPOFF = OrderLocation(lat=39.7750, lng=64.4300, address="Buxoro, Navoiy")


def _order(**kw):
    return AdminOrderCreate(passenger_id=uuid.uuid4(), pickup=PICKUP, **kw)


def test_an_order_may_omit_its_destination():
    assert _order().destination is None


def test_a_destination_is_still_accepted():
    assert _order(destination=DROPOFF).destination is not None


def test_a_pickup_is_never_optional():
    """Without one there is nobody to collect and nowhere to dispatch to."""
    with pytest.raises(ValidationError):
        AdminOrderCreate(passenger_id=uuid.uuid4(), destination=DROPOFF)


# ── Service area ──────────────────────────────────────────────────────
# A metered order has no destination to validate, but the pickup must still be
# inside the area — the guard should do what it can rather than nothing.


def test_the_pickup_is_still_guarded_without_a_destination(monkeypatch):
    monkeypatch.setattr(service_area, "is_within_service_area", lambda *_: False)

    with pytest.raises(service_area.OutsideServiceArea) as exc:
        service_area.check_ride_area(39.0, 64.0)

    assert "pickup" in str(exc.value)


def test_a_valid_pickup_passes_without_a_destination(monkeypatch):
    monkeypatch.setattr(service_area, "is_within_service_area", lambda *_: True)
    service_area.check_ride_area(39.7681, 64.4215)  # must not raise


def test_a_destination_is_still_checked_when_given(monkeypatch):
    """Only the pickup is inside; the destination must still be refused."""
    inside = {(39.7681, 64.4215)}
    monkeypatch.setattr(
        service_area, "is_within_service_area",
        lambda lat, lng: (lat, lng) in inside,
    )

    with pytest.raises(service_area.OutsideServiceArea) as exc:
        service_area.check_ride_area(39.7681, 64.4215, 10.0, 10.0)

    assert "destination" in str(exc.value)
