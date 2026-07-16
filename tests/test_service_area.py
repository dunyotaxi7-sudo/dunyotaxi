"""Tests for the service-area restriction (point-in-polygon gate)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from shapely.geometry import Point, shape

from app.services import service_area
from app.services.service_area import OutsideServiceArea, check_ride_area

FULL = Path("data/bukhara_region.geojson")
SIMPLIFIED = Path("data/bukhara_region.simplified.geojson")

# lat, lng
BUKHARA_CITY = (39.767, 64.421)      # clearly inside
GIJDUVON = (40.10, 64.68)            # Bukhara district — inside
NAVOIY_CITY = (40.5, 65.0)           # neighbor area — inside naive bbox but OUTSIDE
SAMARKAND = (39.65, 66.96)           # far outside
TASHKENT = (41.3, 69.2)              # far outside


@pytest.fixture(autouse=True)
def _load_area():
    """Load the full polygon into the module's in-memory cache."""
    feat = json.loads(FULL.read_text(encoding="utf-8"))
    service_area._geom = shape(feat["geometry"])
    yield
    service_area._geom = None


def test_inside_points_allowed():
    assert service_area.is_within_service_area(*BUKHARA_CITY) is True
    assert service_area.is_within_service_area(*GIJDUVON) is True


def test_neighbor_in_bbox_but_outside_polygon_rejected():
    # This is the case a naive bounding box would wrongly allow.
    lat, lng = NAVOIY_CITY
    feat = json.loads(FULL.read_text(encoding="utf-8"))
    minx, miny, maxx, maxy = shape(feat["geometry"]).bounds
    assert minx <= lng <= maxx and miny <= lat <= maxy, "point should be inside bbox"
    assert service_area.is_within_service_area(lat, lng) is False


def test_far_points_rejected():
    assert service_area.is_within_service_area(*SAMARKAND) is False
    assert service_area.is_within_service_area(*TASHKENT) is False


def test_check_ride_area_both_inside_ok():
    check_ride_area(*BUKHARA_CITY, *GIJDUVON)  # no raise


def test_check_ride_area_bad_destination():
    with pytest.raises(OutsideServiceArea) as e:
        check_ride_area(*BUKHARA_CITY, *NAVOIY_CITY)
    assert e.value.point == "destination"


def test_check_ride_area_bad_pickup():
    with pytest.raises(OutsideServiceArea) as e:
        check_ride_area(*SAMARKAND, *BUKHARA_CITY)
    assert e.value.point == "pickup"


def test_check_ride_area_both_outside_reports_pickup_first():
    with pytest.raises(OutsideServiceArea) as e:
        check_ride_area(*SAMARKAND, *TASHKENT)
    assert e.value.point == "pickup"


def test_fails_open_when_unloaded():
    service_area._geom = None
    assert service_area.is_within_service_area(*SAMARKAND) is True


def test_simplified_matches_full_on_samples():
    """The client bundles the simplified polygon — it must agree with the full
    boundary on clear-cut sample points (so pre-check matches the backend)."""
    full = shape(json.loads(FULL.read_text())["geometry"])
    simp = shape(json.loads(SIMPLIFIED.read_text())["geometry"])
    for lat, lng in [BUKHARA_CITY, GIJDUVON, NAVOIY_CITY, SAMARKAND, TASHKENT]:
        p = Point(lng, lat)
        assert full.covers(p) == simp.covers(p), f"mismatch at {lat},{lng}"
