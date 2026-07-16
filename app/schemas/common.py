"""Shared schema primitives."""
from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

PHONE_RE = re.compile(r"^\+998\d{9}$")


class ORMModel(BaseModel):
    """Base for response models read from ORM objects."""

    model_config = ConfigDict(from_attributes=True)


class GeoPoint(BaseModel):
    """A WGS84 coordinate. ``lat``/``lng`` in decimal degrees."""

    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class PhoneMixin(BaseModel):
    phone: str = Field(..., examples=["+998901234567"])

    @field_validator("phone")
    @classmethod
    def _check_phone(cls, v: str) -> str:
        v = v.strip()
        if not PHONE_RE.match(v):
            raise ValueError("phone must match +998XXXXXXXXX")
        return v


class Message(BaseModel):
    detail: str
