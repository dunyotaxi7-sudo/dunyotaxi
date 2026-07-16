"""Tests for the pricing service (pure fare/night/promo logic)."""
from __future__ import annotations

from datetime import datetime, time
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.services import pricing
from app.services.pricing import apply_promo, compute_fare, is_night


def make_cfg(**over):
    base = dict(
        base_fare=10000, base_km=2.0, price_per_km=2500, min_price=10000,
        night_multiplier=1.20, night_start=time(22, 0), night_end=time(6, 0),
    )
    base.update(over)
    return SimpleNamespace(**base)


# ── Night window ──────────────────────────────────────────────────────


@pytest.mark.parametrize("t,expected", [
    (time(23, 0), True),
    (time(2, 0), True),
    (time(5, 59), True),
    (time(6, 0), False),
    (time(12, 0), False),
    (time(21, 59), False),
    (time(22, 0), True),
])
def test_is_night_wraparound(t, expected):
    assert is_night(t, time(22, 0), time(6, 0)) is expected


def test_is_night_same_day_window():
    assert is_night(time(2, 0), time(1, 0), time(5, 0)) is True
    assert is_night(time(6, 0), time(1, 0), time(5, 0)) is False


# ── Fare formula ──────────────────────────────────────────────────────


def test_base_fare_covers_base_km():
    cfg = make_cfg()
    # 2 km == base_km, so only base_fare applies.
    price, night, _ = compute_fare(cfg, 2.0, datetime(2026, 6, 29, 12, 0))
    assert price == 10000
    assert night is False


def test_extra_km_charged():
    cfg = make_cfg()
    # 5 km => base (2km) + 3 extra km * 2500 = 10000 + 7500 = 17500
    price, _, _ = compute_fare(cfg, 5.0, datetime(2026, 6, 29, 12, 0))
    assert price == 17500


def test_min_price_floor():
    cfg = make_cfg(base_fare=3000, min_price=10000)
    price, _, _ = compute_fare(cfg, 1.0, datetime(2026, 6, 29, 12, 0))
    assert price == 10000


def test_night_multiplier_applied():
    cfg = make_cfg()
    day = compute_fare(cfg, 5.0, datetime(2026, 6, 29, 12, 0))[0]
    night, is_n, _ = compute_fare(cfg, 5.0, datetime(2026, 6, 29, 23, 0))
    assert is_n is True
    assert night == int(round(day * 1.20))  # 17500 * 1.2 = 21000


def test_money_is_integer():
    cfg = make_cfg(price_per_km=2333)
    price, _, _ = compute_fare(cfg, 3.7, datetime(2026, 6, 29, 12, 0))
    assert isinstance(price, int)


# ── Promo ─────────────────────────────────────────────────────────────


def test_promo_fixed():
    promo = SimpleNamespace(
        discount_type="fixed", discount_value=5000, max_discount=None,
        min_ride_price=0,
    )
    assert apply_promo(20000, promo) == 5000


def test_promo_percent_with_cap():
    promo = SimpleNamespace(
        discount_type="percent", discount_value=50, max_discount=8000,
        min_ride_price=0,
    )
    # 50% of 20000 = 10000, capped at 8000
    assert apply_promo(20000, promo) == 8000


def test_promo_below_min_ride_price():
    promo = SimpleNamespace(
        discount_type="fixed", discount_value=5000, max_discount=None,
        min_ride_price=30000,
    )
    assert apply_promo(20000, promo) == 0


def test_promo_never_exceeds_price():
    promo = SimpleNamespace(
        discount_type="fixed", discount_value=999999, max_discount=None,
        min_ride_price=0,
    )
    assert apply_promo(12000, promo) == 12000


def test_no_promo_returns_zero():
    assert apply_promo(15000, None) == 0
