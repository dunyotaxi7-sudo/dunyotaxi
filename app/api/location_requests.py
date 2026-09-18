"""Passenger side of an operator's "where are you?" request.

The operator opens the request (see the admin router); these are the three
calls the passenger's app makes against it — read it to render the consent
screen, then share or decline. Nothing here runs without the passenger
tapping first.
"""
from __future__ import annotations

import redis.asyncio as redis
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user, get_redis_dep
from app.models import User
from app.schemas.location import LocationRequestPublic, LocationShareIn
from app.services import location_request

router = APIRouter(prefix="/location-requests", tags=["location-requests"])


def _not_found() -> HTTPException:
    return HTTPException(
        status.HTTP_404_NOT_FOUND, "So'rov topilmadi yoki muddati tugagan"
    )


@router.get("/{request_id}", response_model=LocationRequestPublic)
async def view_request(
    request_id: str,
    user: User = Depends(get_current_user),
    r: redis.Redis = Depends(get_redis_dep),
):
    """Is this request still open? Lets the app show "already answered" or
    "expired" instead of a live consent prompt."""
    req = await location_request.get(r, request_id)
    if req is None or req["user_id"] != str(user.id):
        raise _not_found()
    return LocationRequestPublic(request_id=request_id, status=req["status"])


@router.post("/{request_id}/share", response_model=LocationRequestPublic)
async def share_location(
    request_id: str,
    payload: LocationShareIn,
    user: User = Depends(get_current_user),
    r: redis.Redis = Depends(get_redis_dep),
):
    """The passenger agreed: hand the operator this one GPS fix."""
    try:
        await location_request.answer(
            r,
            request_id,
            str(user.id),
            lat=payload.lat,
            lng=payload.lng,
            address=payload.address,
            accuracy_m=payload.accuracy_m,
        )
    except location_request.LocationRequestError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    return LocationRequestPublic(
        request_id=request_id, status=location_request.STATUS_SHARED
    )


@router.post("/{request_id}/decline", response_model=LocationRequestPublic)
async def decline_request(
    request_id: str,
    user: User = Depends(get_current_user),
    r: redis.Redis = Depends(get_redis_dep),
):
    """The passenger said no — the operator stops waiting and asks verbally."""
    try:
        await location_request.decline(r, request_id, str(user.id))
    except location_request.LocationRequestError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    return LocationRequestPublic(
        request_id=request_id, status=location_request.STATUS_DECLINED
    )
