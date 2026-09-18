"""Schemas for operator→passenger location requests."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class LocationShareIn(BaseModel):
    """The fix the passenger's app posts back after they tap "share"."""

    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    # Generous on purpose: a wordy geocoder label must never cost us the fix.
    # The store trims it to the length an order's address column takes.
    address: str | None = Field(default=None, max_length=500)
    # Radius of the fix in metres, straight from the OS — lets the operator
    # see when a point came from cell towers rather than GPS.
    accuracy_m: float | None = Field(default=None, ge=0)


class LocationRequestPublic(BaseModel):
    """What the passenger's app sees: enough to render the consent screen."""

    request_id: str
    status: str


class AdminLocationRequestCreate(BaseModel):
    passenger_id: uuid.UUID


class AdminLocationRequestOut(BaseModel):
    """The operator's view — the answer fields stay null until it arrives."""

    request_id: str
    status: str
    lat: float | None = None
    lng: float | None = None
    address: str | None = None
    accuracy_m: float | None = None
    # Devices the push actually went to, so the operator knows whether to
    # expect an answer at all.
    devices: int = 0
    expires_in: int = 0
