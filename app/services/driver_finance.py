"""Read-only finance queries for the driver app: earnings, wallet, history."""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import (
    BonusAchievement,
    BonusCampaign,
    Driver,
    DriverCommission,
    Ride,
    Wallet,
    WalletTransaction,
)


def _day_start(days_ago: int = 0) -> datetime:
    d = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    return d - timedelta(days=days_ago)


async def earnings(db: AsyncSession, driver: Driver, daily_days: int = 14) -> dict:
    async def _sum_since(start: datetime) -> int:
        return int((await db.execute(
            select(func.coalesce(func.sum(DriverCommission.driver_earning), 0)).where(
                DriverCommission.driver_id == driver.id,
                DriverCommission.created_at >= start,
            )
        )).scalar() or 0)

    today = await _sum_since(_day_start())
    week = await _sum_since(_day_start(6))
    month = await _sum_since(_day_start(29))

    day = func.date_trunc("day", DriverCommission.created_at)
    rows = await db.execute(
        select(day.label("day"), func.sum(DriverCommission.driver_earning).label("earning"))
        .where(
            DriverCommission.driver_id == driver.id,
            DriverCommission.created_at >= _day_start(daily_days - 1),
        )
        .group_by(day)
        .order_by(day)
    )
    daily = [{"day": r.day.date(), "earning": int(r.earning)} for r in rows]

    return {"today_sum": today, "week_sum": week, "month_sum": month, "daily": daily}


async def wallet_view(db: AsyncSession, driver: Driver) -> dict:
    w = (await db.execute(
        select(Wallet).where(Wallet.user_id == driver.user_id)
    )).scalar_one_or_none()

    owed = int((await db.execute(
        select(func.coalesce(func.sum(DriverCommission.commission_sum), 0)).where(
            DriverCommission.driver_id == driver.id,
            DriverCommission.settled.is_(False),
        )
    )).scalar() or 0)

    balance = int(w.balance) if w else 0
    return {
        "balance": balance,
        "total_earned": int(w.total_earned) if w else 0,
        "total_withdrawn": int(w.total_withdrawn) if w else 0,
        "commission_owed": owed,
        "min_balance": settings.min_driver_balance,
        "blocked": balance <= settings.min_driver_balance,
    }


async def transactions(db: AsyncSession, driver: Driver, limit: int = 100) -> list:
    w = (await db.execute(
        select(Wallet.id).where(Wallet.user_id == driver.user_id)
    )).scalar_one_or_none()
    if w is None:
        return []
    rows = (await db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.wallet_id == w)
        .order_by(WalletTransaction.created_at.desc())
        .limit(limit)
    )).scalars()
    return [
        {
            "amount": t.amount,
            "tx_type": t.tx_type,
            "description": t.description,
            "balance_after": t.balance_after,
            "created_at": t.created_at,
        }
        for t in rows
    ]


async def ride_history(db: AsyncSession, driver: Driver, limit: int = 50) -> list:
    """Completed/cancelled rides for the driver, with per-ride net earning."""
    rows = await db.execute(
        select(Ride, DriverCommission.driver_earning)
        .outerjoin(DriverCommission, DriverCommission.ride_id == Ride.id)
        .where(Ride.driver_id == driver.id)
        .order_by(Ride.created_at.desc())
        .limit(limit)
    )
    out = []
    for ride, earning in rows:
        out.append({
            "ride_id": ride.id,
            "from_address": ride.from_address,
            "to_address": ride.to_address,
            "distance_km": ride.distance_km,
            "price_sum": ride.price_sum,
            "driver_earning": int(earning) if earning is not None else None,
            "status": ride.status,
            "completed_at": ride.completed_at,
            "created_at": ride.created_at,
        })
    return out


async def bonuses(db: AsyncSession, driver: Driver) -> list:
    """Active driver-facing bonus campaigns with this driver's progress."""
    rows = await db.execute(
        select(BonusCampaign, BonusAchievement)
        .outerjoin(
            BonusAchievement,
            (BonusAchievement.campaign_id == BonusCampaign.id)
            & (BonusAchievement.user_id == driver.user_id),
        )
        .where(
            BonusCampaign.is_active.is_(True),
            BonusCampaign.applies_to.in_(["driver", "both"]),
        )
        .order_by(BonusCampaign.id.desc())
    )
    out = []
    for campaign, ach in rows:
        out.append({
            "campaign_id": campaign.id,
            "name": campaign.name,
            "description": campaign.description,
            "bonus_type": campaign.bonus_type,
            "target_value": campaign.target_value,
            "bonus_amount": campaign.bonus_amount,
            "progress": int(ach.progress) if ach else 0,
            "is_completed": bool(ach.is_completed) if ach else False,
        })
    return out


async def ride_earning(db: AsyncSession, driver: Driver, ride_id) -> dict | None:
    dc = (await db.execute(
        select(DriverCommission).where(
            DriverCommission.ride_id == ride_id,
            DriverCommission.driver_id == driver.id,
        )
    )).scalar_one_or_none()
    if dc is None:
        return None
    return {
        "ride_amount": dc.ride_amount,
        "commission_pct": dc.commission_pct,
        "commission_sum": dc.commission_sum,
        "driver_earning": dc.driver_earning,
    }
