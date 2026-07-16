"""Pricing service — fare estimation driven entirely by pricing_config.

Kept deliberately rate-table-driven so admins change prices via the DB, never
code. All money is integer so'm; we round only at the final step.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PricingConfig, PromoCode


@dataclass(frozen=True)
class Quote:
    distance_km: float
    duration_min: int
    base_fare: int
    price_per_km: int
    night: bool
    night_multiplier: float
    price_sum: int       # before discount
    discount: int
    final_price: int     # after discount, >= min_price floor handled pre-discount


# Average city speed assumption for ETA (km/h).
AVG_SPEED_KMH = 30.0


def is_night(now_t: time, night_start: time, night_end: time) -> bool:
    """True if ``now_t`` falls in the night window.

    Handles the common wrap-around case (e.g. 22:00 → 06:00).
    """
    if night_start == night_end:
        return False
    if night_start < night_end:
        # Same-day window, e.g. 01:00 → 05:00.
        return night_start <= now_t < night_end
    # Wrap-around window, e.g. 22:00 → 06:00.
    return now_t >= night_start or now_t < night_end


def _round_som(value: Decimal) -> int:
    return int(value.to_integral_value(rounding=ROUND_HALF_UP))


def compute_fare(
    cfg: PricingConfig, distance_km: float, at: datetime
) -> tuple[int, bool, int]:
    """Core fare formula. Returns (price_sum, is_night, duration_min).

    base_fare covers the first ``base_km``; every additional km costs
    ``price_per_km``. The night multiplier scales the whole fare. The result is
    floored at ``min_price``.
    """
    distance = Decimal(str(max(distance_km, 0)))
    base_km = Decimal(str(cfg.base_km))
    extra_km = max(distance - base_km, Decimal("0"))

    fare = Decimal(cfg.base_fare) + extra_km * Decimal(cfg.price_per_km)

    night = is_night(at.time(), cfg.night_start, cfg.night_end)
    if night:
        fare = fare * Decimal(str(cfg.night_multiplier))

    price = max(_round_som(fare), int(cfg.min_price))
    duration_min = int(round(float(distance) / AVG_SPEED_KMH * 60)) or 1
    return price, night, duration_min


def apply_promo(price_sum: int, promo: PromoCode | None) -> int:
    """Return the discount amount (so'm) a promo grants for ``price_sum``.

    Validity/limit checks are the caller's responsibility (see ride service);
    this is the pure money calculation.
    """
    if promo is None or price_sum < (promo.min_ride_price or 0):
        return 0
    if promo.discount_type == "fixed":
        discount = promo.discount_value
    else:  # percent
        discount = _round_som(Decimal(price_sum) * Decimal(promo.discount_value) / 100)
        if promo.max_discount is not None:
            discount = min(discount, promo.max_discount)
    return max(0, min(discount, price_sum))


async def get_active_config(db: AsyncSession) -> PricingConfig | None:
    res = await db.execute(
        select(PricingConfig)
        .where(PricingConfig.is_active.is_(True))
        .order_by(PricingConfig.updated_at.desc())
        .limit(1)
    )
    return res.scalar_one_or_none()


async def get_promo_by_code(db: AsyncSession, code: str | None) -> PromoCode | None:
    if not code:
        return None
    res = await db.execute(
        select(PromoCode).where(
            PromoCode.code == code.strip().upper(),
            PromoCode.is_active.is_(True),
        )
    )
    return res.scalar_one_or_none()
