"""Operator password hashing + permission-guard logic (no DB)."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.deps import require_permission, require_staff
from app.core.security import hash_password, verify_password


def _user(role, permissions=None):
    return SimpleNamespace(role=role, permissions=permissions)


# ── passwords ──────────────────────────────────────────────────────────

def test_password_roundtrip():
    h = hash_password("Str0ngPass")
    assert verify_password("Str0ngPass", h)
    assert not verify_password("wrong", h)


def test_verify_none_hash():
    assert verify_password("anything", None) is False


def test_long_password_does_not_raise():
    h = hash_password("x" * 200)
    assert verify_password("x" * 200, h)


# ── require_staff ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_require_staff_allows_admin_and_operator():
    assert (await require_staff(_user("admin"))).role == "admin"
    assert (await require_staff(_user("operator"))).role == "operator"


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["passenger", "driver"])
async def test_require_staff_rejects_non_staff(role):
    with pytest.raises(HTTPException) as e:
        await require_staff(_user(role))
    assert e.value.status_code == 403


# ── require_permission ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_bypasses_permission():
    guard = require_permission("deposit")
    assert (await guard(_user("admin"))).role == "admin"


@pytest.mark.asyncio
async def test_operator_with_permission_allowed():
    guard = require_permission("finance")
    op = _user("operator", {"finance": True, "deposit": False})
    assert (await guard(op)) is op


@pytest.mark.asyncio
async def test_operator_without_permission_denied():
    guard = require_permission("deposit")
    op = _user("operator", {"finance": True, "deposit": False})
    with pytest.raises(HTTPException) as e:
        await guard(op)
    assert e.value.status_code == 403


@pytest.mark.asyncio
async def test_operator_missing_permissions_denied():
    guard = require_permission("moderate_drivers")
    with pytest.raises(HTTPException):
        await guard(_user("operator", None))
