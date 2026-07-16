"""Ride lifecycle schemas."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.schemas.common import GeoPoint, ORMModel

PAYMENT_METHODS = {"cash", "payme", "click", "uzum", "wallet"}


class EstimateRequest(BaseModel):
    from_location: GeoPoint
    to_location: GeoPoint
    # Optional client-measured distance; otherwise computed great-circle.
    distance_km: float | None = Field(default=None, ge=0)
    promo_code: str | None = None


class EstimateResponse(BaseModel):
    distance_km: float
    duration_min: int
    base_fare: int
    price_per_km: int
    night: bool
    night_multiplier: float
    price_sum: int
    discount: int = 0
    final_price: int
    currency: str = "UZS"


class RideRequest(BaseModel):
    from_location: GeoPoint
    to_location: GeoPoint
    from_address: str = Field(..., max_length=200)
    to_address: str = Field(..., max_length=200)
    distance_km: float | None = Field(default=None, ge=0)
    payment_method: str = Field(default="cash")
    promo_code: str | None = None


class RidePublic(ORMModel):
    id: uuid.UUID
    passenger_id: uuid.UUID
    driver_id: uuid.UUID | None = None
    from_address: str
    to_address: str
    distance_km: Decimal | None = None
    duration_min: int | None = None
    price_sum: int | None = None
    status: str
    payment_method: str
    cancelled_by: str | None = None
    cancel_reason: str | None = None
    created_at: datetime | None = None
    accepted_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None


class RideCancel(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class RatingCreate(BaseModel):
    score: int = Field(..., ge=1, le=5)
    comment: str | None = None


class NearbyDriver(BaseModel):
    driver_id: str
    lat: float
    lng: float
    distance_m: float


class RideDriverInfo(BaseModel):
    driver_id: uuid.UUID
    full_name: str
    phone: str
    car_model: str
    car_number: str
    car_color: str | None = None
    rating: Decimal


class RideOfferDetails(BaseModel):
    ride_id: uuid.UUID
    from_address: str
    to_address: str
    distance_km: Decimal | None = None
    price_sum: int | None = None
    payment_method: str
    passenger_rating: float | None = None


class RideDriverView(BaseModel):
    """Operational view of a ride for the assigned driver — includes GPS coords
    (extracted from PostGIS) and passenger contact info."""

    id: uuid.UUID
    status: str
    from_address: str
    to_address: str
    from_lat: float
    from_lng: float
    to_lat: float
    to_lng: float
    distance_km: Decimal | None = None
    price_sum: int | None = None
    payment_method: str
    passenger_name: str
    passenger_phone: str
    passenger_rating: float | None = None
