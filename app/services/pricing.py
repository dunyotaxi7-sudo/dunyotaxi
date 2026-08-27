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

from app.models import CarType, PricingConfig, PromoCode


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
    cfg: PricingConfig, distance_km: float, at: datetime,
    tier_multiplier: Decimal | float = 1,
) -> tuple[int, bool, int]:
    """Core fare formula. Returns (price_sum, is_night, duration_min).

    base_fare covers the first ``base_km``; every additional km costs
    ``price_per_km``. The night multiplier scales the whole fare, then the car
    tier multiplier scales it again. The result is floored at ``min_price``
    (itself scaled by the tier, so a higher tier has a higher minimum).
    """
    distance = Decimal(str(max(distance_km, 0)))
    base_km = Decimal(str(cfg.base_km))
    extra_km = max(distance - base_km, Decimal("0"))
    tier = Decimal(str(tier_multiplier))

    fare = Decimal(cfg.base_fare) + extra_km * Decimal(cfg.price_per_km)

    night = is_night(at.time(), cfg.night_start, cfg.night_end)
    if night:
        fare = fare * Decimal(str(cfg.night_multiplier))

    fare = fare * tier
    price = max(_round_som(fare), _round_som(Decimal(cfg.min_price) * tier))
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


def compute_waiting_charge(cfg: PricingConfig, waiting_seconds: int) -> int:
    """So'm charged for waiting time: full (ceil) minutes beyond the free
    allowance, times the per-minute rate. Pure & deterministic."""
    if waiting_seconds <= 0:
        return 0
    minutes = -(-waiting_seconds // 60)  # ceil division
    billable = max(0, minutes - cfg.wait_free_minutes)
    return billable * cfg.wait_per_minute


async def get_active_config(db: AsyncSession) -> PricingConfig | None:
    res = await db.execute(
        select(PricingConfig)
        .where(PricingConfig.is_active.is_(True))
        .order_by(PricingConfig.updated_at.desc())
        .limit(1)
    )
    return res.scalar_one_or_none()


async def get_active_car_types(db: AsyncSession) -> list[CarType]:
    """Active service tiers, cheapest first. Empty if none configured."""
    res = await db.execute(
        select(CarType)
        .where(CarType.is_active.is_(True))
        .order_by(CarType.sort_order, CarType.multiplier)
    )
    return list(res.scalars())


async def eligible_car_classes(db: AsyncSession, car_type: str) -> list[str]:
    """Tiers that may serve a ``car_type`` order.

    Tiers form a hierarchy by sort_order: a driver of a higher-or-equal rank
    serves the order. So an Econom order can be taken by Econom/Komfort/Biznes
    drivers; a Biznes order only by Biznes. Falls back to an exact match if the
    tier isn't found.
    """
    rank = await db.execute(
        select(CarType.sort_order).where(CarType.code == car_type)
    )
    order_rank = rank.scalar_one_or_none()
    if order_rank is None:
        return [car_type]
    res = await db.execute(
        select(CarType.code).where(CarType.sort_order >= order_rank)
    )
    return [c for c in res.scalars()]


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
