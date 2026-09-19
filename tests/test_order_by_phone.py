"""Taking an order for a caller who has no account yet.

Call-centre callers are usually unregistered, and sending the operator to the
Clients page mid-call was the slow part. An order may now name its passenger by
phone number instead of by id, and an unknown number gets an account as a
by-product of taking the order.
"""
from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from app.schemas.admin import AdminOrderCreate, OrderLocation

PICKUP = OrderLocation(lat=39.7681, lng=64.4215, address="Buxoro, Mustaqillik")
DROPOFF = OrderLocation(lat=39.7750, lng=64.4300, address="Buxoro, Navoiy")


def _order(**kw):
    return AdminOrderCreate(pickup=PICKUP, destination=DROPOFF, **kw)


def test_an_existing_client_is_named_by_id():
    order = _order(passenger_id=uuid.uuid4())
    assert order.passenger_phone is None


def test_a_new_caller_is_named_by_phone():
    order = _order(passenger_phone="+998932642233")
    assert order.passenger_id is None
    assert order.passenger_name is None  # name stays optional


def test_a_name_may_be_given_but_is_never_required():
    order = _order(passenger_phone="+998932642233", passenger_name="Aziz")
    assert order.passenger_name == "Aziz"


def test_naming_the_passenger_twice_is_refused():
    """Ambiguity here would silently pick one and ignore the other."""
    with pytest.raises(ValidationError):
        _order(passenger_id=uuid.uuid4(), passenger_phone="+998932642233")


def test_naming_no_passenger_at_all_is_refused():
    with pytest.raises(ValidationError):
        _order()


@pytest.mark.parametrize(
    "typed",
    ["932642233", "93 264 22 33", "998932642233", "+998 93 264 22 33", "x"],
)
def test_the_phone_must_arrive_normalised(typed):
    """The panel normalises what the operator types; the API insists on the
    stored form, so a half-normalised number can never create a duplicate
    account under a second spelling."""
    with pytest.raises(ValidationError):
        _order(passenger_phone=typed)
