"""Admin panel schemas: pricing, commission, bonus, promo, moderation, stats."""
from __future__ import annotations

import uuid
from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import PHONE_RE, ORMModel, PhoneMixin

# ── Pricing ───────────────────────────────────────────────────────────


class PricingConfigBase(BaseModel):
    base_fare: int = Field(..., ge=0)
    base_km: float = Field(..., ge=0)
    price_per_km: int = Field(..., ge=0)
    min_price: int = Field(..., ge=0)
    night_multiplier: float = Field(..., ge=1)
    night_start: time
    night_end: time
    is_active: bool = True


class PricingConfigCreate(PricingConfigBase):
    pass


class PricingConfigUpdate(BaseModel):
    base_fare: int | None = Field(default=None, ge=0)
    base_km: float | None = Field(default=None, ge=0)
    price_per_km: int | None = Field(default=None, ge=0)
    min_price: int | None = Field(default=None, ge=0)
    night_multiplier: float | None = Field(default=None, ge=1)
    night_start: time | None = None
    night_end: time | None = None
    is_active: bool | None = None


class PricingConfigPublic(ORMModel):
    id: int
    base_fare: int
    base_km: Decimal
    price_per_km: int
    min_price: int
    night_multiplier: Decimal
    night_start: time
    night_end: time
    is_active: bool
    updated_at: datetime | None = None


# ── Commission ────────────────────────────────────────────────────────


class CommissionConfigCreate(BaseModel):
    driver_id: uuid.UUID | None = None  # None = global
    commission_pct: float = Field(..., ge=0, le=100)
    valid_from: date | None = None
    valid_until: date | None = None


class CommissionConfigPublic(ORMModel):
    id: int
    driver_id: uuid.UUID | None = None
    commission_pct: Decimal
    valid_from: date
    valid_until: date | None = None
    created_at: datetime | None = None


# ── Driver moderation ─────────────────────────────────────────────────


class DriverModeration(BaseModel):
    status: str = Field(..., description="approved|rejected|suspended|pending")
    reason: str | None = None


class DocumentReview(BaseModel):
    status: str = Field(..., description="approved|rejected")
    reject_reason: str | None = None


class UserBlock(BaseModel):
    is_blocked: bool
    reason: str | None = None


# ── Bonus campaigns ───────────────────────────────────────────────────


class BonusCampaignCreate(BaseModel):
    name: str = Field(..., max_length=100)
    description: str | None = None
    bonus_type: str
    target_value: int | None = None
    bonus_amount: int | None = None
    bonus_pct: float | None = None
    applies_to: str = "driver"
    is_active: bool = True
    start_date: date | None = None
    end_date: date | None = None


class BonusCampaignUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    target_value: int | None = None
    bonus_amount: int | None = None
    bonus_pct: float | None = None
    applies_to: str | None = None
    is_active: bool | None = None
    start_date: date | None = None
    end_date: date | None = None


class BonusCampaignPublic(ORMModel):
    id: int
    name: str
    description: str | None = None
    bonus_type: str
    target_value: int | None = None
    bonus_amount: int | None = None
    bonus_pct: Decimal | None = None
    applies_to: str
    is_active: bool
    start_date: date | None = None
    end_date: date | None = None
    created_at: datetime | None = None


# ── Promo codes ───────────────────────────────────────────────────────


class PromoCodeCreate(BaseModel):
    code: str = Field(..., max_length=20)
    discount_type: str = Field(..., description="fixed|percent")
    discount_value: int = Field(..., ge=0)
    max_discount: int | None = None
    min_ride_price: int = 0
    usage_limit: int | None = None
    per_user_limit: int = 1
    valid_from: date | None = None
    valid_until: date | None = None
    is_active: bool = True


class PromoCodeUpdate(BaseModel):
    discount_value: int | None = None
    max_discount: int | None = None
    min_ride_price: int | None = None
    usage_limit: int | None = None
    per_user_limit: int | None = None
    valid_from: date | None = None
    valid_until: date | None = None
    is_active: bool | None = None


class PromoCodePublic(ORMModel):
    id: int
    code: str
    discount_type: str
    discount_value: int
    max_discount: int | None = None
    min_ride_price: int
    usage_limit: int | None = None
    used_count: int
    per_user_limit: int
    valid_from: date | None = None
    valid_until: date | None = None
    is_active: bool


# ── Stats ─────────────────────────────────────────────────────────────


class StatsResponse(BaseModel):
    rides_total: int
    rides_completed: int
    rides_cancelled: int
    rides_active: int
    revenue_sum: int
    commission_sum: int
    active_drivers: int
    online_drivers: int
    period_from: datetime | None = None
    period_to: datetime | None = None


class DailyStat(BaseModel):
    day: date
    rides: int
    completed: int
    revenue_sum: int


class PassengerRow(BaseModel):
    id: uuid.UUID
    full_name: str
    phone: str
    total_rides: int
    is_blocked: bool
    created_at: datetime | None = None


class PassengerDetail(BaseModel):
    id: uuid.UUID
    full_name: str
    phone: str
    is_blocked: bool
    created_at: datetime | None = None
    total_rides: int
    completed_rides: int
    ratings_given: int


class PassengerUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=13)

    @field_validator("phone")
    @classmethod
    def _check_phone(cls, v: str | None) -> str | None:
        # Must match the login format exactly, or the user could never sign in.
        if v is None:
            return v
        v = v.strip()
        if not PHONE_RE.match(v):
            raise ValueError("phone must match +998XXXXXXXXX")
        return v


class AdminPassengerCreate(PhoneMixin):
    full_name: str = Field(..., max_length=100)


class UserLookup(BaseModel):
    found: bool
    full_name: str | None = None
    role: str | None = None
    is_blocked: bool = False


class LiveRideRow(BaseModel):
    id: uuid.UUID
    passenger_name: str | None = None
    passenger_phone: str | None = None
    driver_name: str | None = None
    driver_phone: str | None = None
    from_address: str
    to_address: str
    price_sum: int | None = None
    status: str
    created_at: datetime | None = None
    accepted_at: datetime | None = None


class AdminRideRow(BaseModel):
    id: uuid.UUID
    passenger_name: str | None = None
    driver_name: str | None = None
    from_address: str
    to_address: str
    distance_km: Decimal | None = None
    price_sum: int | None = None
    status: str
    payment_method: str
    created_at: datetime | None = None


class AdminRideRating(BaseModel):
    score: int
    comment: str | None = None
    from_role: str


class AdminRideDetail(BaseModel):
    id: uuid.UUID
    status: str
    from_address: str
    to_address: str
    from_lat: float
    from_lng: float
    to_lat: float
    to_lng: float
    distance_km: Decimal | None = None
    duration_min: int | None = None
    price_sum: int | None = None
    payment_method: str
    payment_status: str | None = None
    cancelled_by: str | None = None
    cancel_reason: str | None = None
    created_at: datetime | None = None
    completed_at: datetime | None = None
    passenger_name: str | None = None
    passenger_phone: str | None = None
    driver_name: str | None = None
    driver_phone: str | None = None
    car_model: str | None = None
    car_number: str | None = None
    commission_sum: int | None = None
    driver_earning: int | None = None
    commission_pct: Decimal | None = None
    ratings: list[AdminRideRating] = []


class ServiceAreaOut(BaseModel):
    name: str
    point_count: int
    geojson: dict


class ServiceAreaUpdate(BaseModel):
    name: str | None = None
    # A GeoJSON Feature, FeatureCollection, or bare Polygon/MultiPolygon geometry.
    geojson: dict


class AdminDriverRow(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    full_name: str | None = None
    phone: str | None = None
    car_model: str
    car_number: str
    car_color: str | None = None
    rating: Decimal
    total_rides: int
    status: str
    is_online: bool
    balance: int
    low_balance: bool


class AdminDriverCreate(PhoneMixin):
    full_name: str = Field(..., max_length=100)
    car_model: str = Field(..., max_length=50)
    car_number: str = Field(..., max_length=15)
    car_color: str | None = Field(default=None, max_length=30)
    car_year: int | None = Field(default=None, ge=1950, le=2100)
    # Admin-created drivers are trusted → approved by default.
    status: str = Field(default="approved")


class AdminDriverProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=100)
    car_model: str | None = Field(default=None, max_length=50)
    car_number: str | None = Field(default=None, max_length=15)
    car_color: str | None = Field(default=None, max_length=30)
    car_year: int | None = Field(default=None, ge=1950, le=2100)


class DriverTxRow(BaseModel):
    id: uuid.UUID
    created_at: datetime | None = None
    tx_type: str
    amount: int
    balance_after: int
    description: str | None = None
    ride_id: uuid.UUID | None = None
    from_address: str | None = None
    to_address: str | None = None
    ride_amount: int | None = None  # the ride price the commission was taken from
    commission_pct: Decimal | None = None


class DriverBalanceUpdate(BaseModel):
    # Positive = deposit (top-up); negative = deduction/correction. Non-zero.
    amount: int
    note: str | None = Field(default=None, max_length=200)


class DriverBalanceOut(BaseModel):
    driver_id: uuid.UUID
    amount: int
    balance: int
    low_balance: bool


class OrderLocation(BaseModel):
    lat: float
    lng: float
    address: str = Field(..., max_length=200)


class AdminOrderCreate(BaseModel):
    # An existing client (created on the Clients page) — orders never create one.
    passenger_id: uuid.UUID
    pickup: OrderLocation
    destination: OrderLocation
    distance_km: float | None = Field(default=None, ge=0)
    # How the order reaches a driver:
    #   "auto"   → nearest online driver (normal dispatch)
    #   "offer"  → offer the chosen driver first, fall back to nearest if declined
    #   "assign" → force-assign the chosen driver (no accept step)
    connect_mode: str = Field(default="auto")
    driver_id: uuid.UUID | None = None


class AdminOrderOut(BaseModel):
    ride_id: uuid.UUID
    status: str
    connect_mode: str
    passenger_id: uuid.UUID
    passenger_phone: str
    passenger_name: str
    driver_id: uuid.UUID | None = None
    price_sum: int | None = None
    distance_km: Decimal | None = None


class AuditLogPublic(ORMModel):
    id: uuid.UUID
    admin_id: uuid.UUID
    action: str
    entity_type: str | None = None
    entity_id: str | None = None
    old_value: dict | None = None
    new_value: dict | None = None
    ip_address: str | None = None
    created_at: datetime | None = None
