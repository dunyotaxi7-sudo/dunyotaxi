"""Driver-facing schemas."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class DriverRegister(BaseModel):
    car_model: str = Field(..., max_length=50)
    car_number: str = Field(..., max_length=15)
    car_color: str | None = Field(default=None, max_length=30)
    car_year: int | None = Field(default=None, ge=1950, le=2100)


class DriverPublic(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID
    car_model: str
    car_number: str
    car_color: str | None = None
    car_year: int | None = None
    rating: Decimal
    total_rides: int
    status: str
    is_online: bool


class DocumentUpload(BaseModel):
    doc_type: str = Field(..., description="passport|license|tech_passport|inspection")
    file_url: str = Field(..., max_length=255)


class DocumentPublic(ORMModel):
    id: uuid.UUID
    driver_id: uuid.UUID
    doc_type: str
    file_url: str
    status: str
    reject_reason: str | None = None
    reviewed_at: datetime | None = None
    uploaded_at: datetime | None = None


class DriverStatusUpdate(BaseModel):
    is_online: bool


class DriverTodayStats(BaseModel):
    rides_completed: int
    earnings_sum: int
    is_online: bool


class DailyEarning(BaseModel):
    day: date
    earning: int


class DriverEarnings(BaseModel):
    today_sum: int
    week_sum: int
    month_sum: int
    daily: list[DailyEarning]


class DriverWalletView(BaseModel):
    balance: int
    total_earned: int
    total_withdrawn: int
    commission_owed: int
    min_balance: int = -15000
    blocked: bool = False


class WalletTx(BaseModel):
    amount: int
    tx_type: str
    description: str | None = None
    balance_after: int
    created_at: datetime | None = None


class DriverRideHistory(BaseModel):
    ride_id: uuid.UUID
    from_address: str
    to_address: str
    distance_km: Decimal | None = None
    price_sum: int | None = None
    driver_earning: int | None = None
    status: str
    completed_at: datetime | None = None
    created_at: datetime | None = None


class RideEarningBreakdown(BaseModel):
    ride_amount: int
    commission_pct: Decimal
    commission_sum: int
    driver_earning: int


class DriverBonus(BaseModel):
    campaign_id: int
    name: str
    description: str | None = None
    bonus_type: str
    target_value: int | None = None
    bonus_amount: int | None = None
    progress: int
    is_completed: bool


class OnlineDriver(BaseModel):
    """A live driver position, assembled from Redis + DB metadata."""

    driver_id: uuid.UUID
    lat: float
    lng: float
    distance_m: float | None = None
    rating: float | None = None
    car_model: str | None = None
    car_number: str | None = None
