"""Uzbekistan local time.

Timestamps are stored as naive UTC: every one of the 31 timestamp columns is
``timestamp without time zone`` and the API container runs with TZ unset, so
``datetime.now()`` returns UTC. Storing UTC is correct and stays that way.

What is *not* correct is asking a UTC clock when a day starts. "Bugun" for a
Bukhara driver begins at midnight in Tashkent — 19:00 UTC the previous day — so
computing the boundary with a bare ``datetime.now()`` reset their daily earnings
at 05:00 local and bucketed a whole evening of rides into the wrong day. The
helpers here answer that question in Tashkent and hand back the naive-UTC value
the columns actually hold, so they can be compared against them directly.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func

# Uzbekistan is a fixed UTC+5 and has observed no DST since 1991, so a plain
# offset is exact here and needs no zone database in the image.
UZ_OFFSET = timedelta(hours=5)
UZ = timezone(UZ_OFFSET)


def now_uz() -> datetime:
    """Current Tashkent wall-clock time, timezone-aware."""
    return datetime.now(timezone.utc).astimezone(UZ)


def today_uz() -> date:
    """Today's calendar date in Tashkent."""
    return now_uz().date()


def day_start_utc(days_ago: int = 0) -> datetime:
    """Midnight in Tashkent, ``days_ago`` days back, as naive UTC.

    Compare this against a timestamp column directly — it is already in the
    column's own frame of reference.
    """
    midnight = now_uz().replace(hour=0, minute=0, second=0, microsecond=0)
    midnight -= timedelta(days=days_ago)
    return midnight.astimezone(timezone.utc).replace(tzinfo=None)


def local_day(column):
    """SQL expression bucketing a naive-UTC timestamp column by Tashkent day.

    Shifting the column into local time before truncating puts an 02:00 Tashkent
    ride on the right day instead of the previous one.
    """
    return func.date_trunc("day", column + UZ_OFFSET)
