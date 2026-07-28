"""Car-model catalog mapped to tariffs.

A list of car models, each tied to a car_types tier. A driver picks their model
and their tariff (car_class) is set from the model's tier. Dispatch then treats
tiers as a hierarchy (handled in code): a driver of a higher tier also serves
lower-tier orders.

Revision ID: 0008_car_models
Revises: 0007_operators
Create Date: 2026-07-26
"""
from __future__ import annotations

from typing import Union

from alembic import op

revision: str = "0008_car_models"
down_revision: Union[str, None] = "0007_operators"
branch_labels = None
depends_on = None


# Common cars in Uzbekistan mapped to a sensible tier. Admins can edit/extend.
_SEED = [
    ("Chevrolet Spark", "econom"),
    ("Chevrolet Matiz", "econom"),
    ("Daewoo Matiz", "econom"),
    ("Chevrolet Nexia", "econom"),
    ("Chevrolet Nexia 3", "econom"),
    ("Chevrolet Cobalt", "econom"),
    ("Chevrolet Damas", "econom"),
    ("Chevrolet Lacetti", "komfort"),
    ("Chevrolet Gentra", "komfort"),
    ("Chevrolet Malibu", "komfort"),
    ("Chevrolet Captiva", "komfort"),
    ("Chevrolet Tracker", "komfort"),
    ("Chevrolet Malibu 2", "biznes"),
    ("Chevrolet Traverse", "biznes"),
    ("Chevrolet Tahoe", "biznes"),
    ("Toyota Camry", "biznes"),
]


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS car_models (
            id          SERIAL PRIMARY KEY,
            name        VARCHAR(60) NOT NULL UNIQUE,
            car_type    VARCHAR(20) NOT NULL REFERENCES car_types(code),
            is_active   BOOLEAN NOT NULL DEFAULT TRUE
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_car_models_type ON car_models(car_type)")
    values = ", ".join(
        f"('{name.replace(chr(39), chr(39) * 2)}', '{tier}')" for name, tier in _SEED
    )
    op.execute(
        f"INSERT INTO car_models (name, car_type) VALUES {values} "
        "ON CONFLICT (name) DO NOTHING"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS car_models")
