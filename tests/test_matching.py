"""Tests for the nearest-driver matching service.

The pure ranking logic is tested directly. The Redis-backed expanding-radius
search is tested against fakeredis so no live Redis is required.
"""
from __future__ import annotations

import uuid

import fakeredis.aioredis
import pytest

from app.services import location, matching
from app.services.matching import Candidate, rank_candidates


# ── Pure ranking ──────────────────────────────────────────────────────


def _c(dist, rating, name="d"):
    return Candidate(driver_id=name, distance_m=dist, rating=rating)


def test_rank_by_distance_then_rating():
    a = _c(500, 4.5, "a")
    b = _c(100, 4.0, "b")
    c = _c(300, 5.0, "c")
    ranked = rank_candidates([a, b, c])
    assert [x.driver_id for x in ranked] == ["b", "c", "a"]


def test_rank_ties_broken_by_higher_rating():
    low = _c(200, 3.2, "low")
    high = _c(200, 4.9, "high")
    ranked = rank_candidates([low, high])
    assert [x.driver_id for x in ranked] == ["high", "low"]


def test_rank_is_stable_and_pure():
    items = [_c(100, 5.0, "x"), _c(100, 5.0, "y")]
    ranked = rank_candidates(items)
    # equal keys keep input order; original list untouched
    assert [x.driver_id for x in ranked] == ["x", "y"]
    assert items[0].driver_id == "x"


def test_rank_empty():
    assert rank_candidates([]) == []


# ── Redis expanding-radius search ─────────────────────────────────────


@pytest.fixture
async def redis_client():
    r = fakeredis.aioredis.FakeRedis(decode_responses=True)
    yield r
    await r.flushall()
    await r.aclose()


# Bukhara city centre.
CENTER = (39.767, 64.421)


async def test_search_radius_finds_near_driver(redis_client):
    await location.set_location(redis_client, "near", 39.768, 64.422)  # ~150m
    await location.set_location(redis_client, "far", 39.90, 64.60)     # >20km

    found = await location.search_radius(redis_client, *CENTER, 3000)
    ids = [d for d, _ in found]
    assert "near" in ids
    assert "far" not in ids


async def test_expanding_radius_skips_empty_inner_rings(redis_client):
    # Only a driver ~4km out — outside 3km, inside 5km.
    await location.set_location(redis_client, "mid", 39.803, 64.421)

    inner = await location.search_radius(redis_client, *CENTER, 3000)
    assert inner == []

    expanded = await matching._search_expanding(
        redis_client, *CENTER, [3000, 5000, 8000]
    )
    assert [d for d, _ in expanded] == ["mid"]


async def test_search_returns_sorted_by_distance(redis_client):
    await location.set_location(redis_client, "b", 39.772, 64.421)  # further
    await location.set_location(redis_client, "a", 39.768, 64.421)  # closer
    found = await location.search_radius(redis_client, *CENTER, 8000)
    assert [d for d, _ in found] == ["a", "b"]


async def test_remove_driver_takes_offline(redis_client):
    await location.set_location(redis_client, "x", *CENTER)
    await location.remove_driver(redis_client, "x")
    found = await location.search_radius(redis_client, *CENTER, 8000)
    assert found == []
