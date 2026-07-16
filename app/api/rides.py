"""Ride router: estimate, request, lifecycle transitions, rating."""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from geoalchemy2 import Geometry
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

import redis.asyncio as redis

from app.api.deps import get_current_driver, get_current_user, get_redis_dep
from app.core.database import get_db
from app.models import Driver, Rating, Ride, User
from app.schemas.ride import (
    EstimateRequest,
    EstimateResponse,
    NearbyDriver,
    RatingCreate,
    RideCancel,
    RideDriverInfo,
    RideDriverView,
    RideOfferDetails,
    RidePublic,
    RideRequest,
)
from app.services import matching, ride as ride_service

router = APIRouter(prefix="/rides", tags=["rides"])


# ── Nearby drivers (for the passenger map) ────────────────────────────


@router.get("/nearby-drivers", response_model=list[NearbyDriver])
async def nearby_drivers(
    lat: float,
    lng: float,
    radius_m: int = 5000,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    r: redis.Redis = Depends(get_redis_dep),
):
    radius_m = max(500, min(radius_m, 15000))
    rows = await matching.nearby_drivers_for_display(
        db, r, lat, lng, radius_m=radius_m
    )
    return [NearbyDriver(**row) for row in rows]


# ── Estimate ──────────────────────────────────────────────────────────


@router.post("/estimate", response_model=EstimateResponse)
async def estimate(
    payload: EstimateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        q = await ride_service.estimate(
            db,
            from_lat=payload.from_location.lat, from_lng=payload.from_location.lng,
            to_lat=payload.to_location.lat, to_lng=payload.to_location.lng,
            distance_km=payload.distance_km, promo_code=payload.promo_code,
            at=datetime.now(),
        )
    except ride_service.RideError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return EstimateResponse(**q)


# ── Request a ride ────────────────────────────────────────────────────


@router.post("/request", response_model=RidePublic, status_code=201)
async def request_ride(
    payload: RideRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role not in {"passenger", "driver", "admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed")
    try:
        ride = await ride_service.create_ride(db, user.id, payload)
    except ride_service.RideError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    # Kick off background driver matching.
    ride_service.start_dispatch(
        ride.id, payload.from_location.lat, payload.from_location.lng
    )
    return RidePublic.model_validate(ride)


# ── Read ──────────────────────────────────────────────────────────────


async def _get_owned_ride(db, ride_id: uuid.UUID, user: User) -> Ride:
    ride = await db.get(Ride, ride_id)
    if ride is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ride not found")
    if user.role == "admin":
        return ride
    if ride.passenger_id == user.id:
        return ride
    # Driver participant?
    if ride.driver_id is not None:
        drv = await db.get(Driver, ride.driver_id)
        if drv and drv.user_id == user.id:
            return ride
    raise HTTPException(status.HTTP_403_FORBIDDEN, "not your ride")


@router.get("/mine", response_model=list[RidePublic])
async def my_rides(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
):
    res = await db.execute(
        select(Ride).where(Ride.passenger_id == user.id)
        .order_by(Ride.created_at.desc()).limit(limit)
    )
    return [RidePublic.model_validate(r) for r in res.scalars()]


@router.get("/{ride_id}", response_model=RidePublic)
async def get_ride(
    ride_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ride = await _get_owned_ride(db, ride_id, user)
    return RidePublic.model_validate(ride)


@router.get("/{ride_id}/driver", response_model=RideDriverInfo)
async def get_ride_driver(
    ride_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Assigned driver's card info (name, car, plate, rating) for the rider."""
    ride = await _get_owned_ride(db, ride_id, user)
    if ride.driver_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no driver assigned yet")
    driver = await db.get(Driver, ride.driver_id)
    driver_user = await db.get(User, driver.user_id) if driver else None
    if driver is None or driver_user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "driver not found")
    return RideDriverInfo(
        driver_id=driver.id,
        full_name=driver_user.full_name,
        phone=driver_user.phone,
        car_model=driver.car_model,
        car_number=driver.car_number,
        car_color=driver.car_color,
        rating=driver.rating,
    )


# ── Driver decisions ──────────────────────────────────────────────────


@router.get("/{ride_id}/offer", response_model=RideOfferDetails)
async def get_ride_offer(
    ride_id: uuid.UUID,
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """Details a driver needs to decide on an offer. Only visible to the driver
    the ride is currently being offered to."""
    if ride_service.offered_driver(str(ride_id)) != str(driver.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no active offer for you")
    ride = await db.get(Ride, ride_id)
    if ride is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ride not found")

    avg = (await db.execute(
        select(func.avg(Rating.score)).where(Rating.to_user_id == ride.passenger_id)
    )).scalar()

    return RideOfferDetails(
        ride_id=ride.id,
        from_address=ride.from_address,
        to_address=ride.to_address,
        distance_km=ride.distance_km,
        price_sum=ride.price_sum,
        payment_method=ride.payment_method,
        passenger_rating=round(float(avg), 2) if avg is not None else None,
    )


@router.get("/{ride_id}/driver-view", response_model=RideDriverView)
async def driver_ride_view(
    ride_id: uuid.UUID,
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """Full operational view for the assigned driver: coords + passenger info."""
    ride = await db.get(Ride, ride_id)
    if ride is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ride not found")
    if ride.driver_id != driver.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not your ride")

    # Extract lat/lng from the PostGIS geography columns.
    from_lat, from_lng, to_lat, to_lng = (await db.execute(
        select(
            func.ST_Y(cast(Ride.from_location, Geometry)),
            func.ST_X(cast(Ride.from_location, Geometry)),
            func.ST_Y(cast(Ride.to_location, Geometry)),
            func.ST_X(cast(Ride.to_location, Geometry)),
        ).where(Ride.id == ride_id)
    )).one()

    passenger = await db.get(User, ride.passenger_id)
    avg = (await db.execute(
        select(func.avg(Rating.score)).where(Rating.to_user_id == ride.passenger_id)
    )).scalar()

    return RideDriverView(
        id=ride.id,
        status=ride.status,
        from_address=ride.from_address,
        to_address=ride.to_address,
        from_lat=from_lat, from_lng=from_lng,
        to_lat=to_lat, to_lng=to_lng,
        distance_km=ride.distance_km,
        price_sum=ride.price_sum,
        payment_method=ride.payment_method,
        passenger_name=passenger.full_name if passenger else "",
        passenger_phone=passenger.phone if passenger else "",
        passenger_rating=round(float(avg), 2) if avg is not None else None,
    )


@router.post("/{ride_id}/accept", response_model=RidePublic)
async def accept_ride(
    ride_id: uuid.UUID,
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    if await ride_service.driver_below_floor(db, driver):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "balance below limit — top up to accept orders",
        )
    if not ride_service.driver_accept(str(ride_id), str(driver.id)):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "no pending offer for you on this ride"
        )
    # The dispatch loop performs the DB assignment; return the (soon) updated ride.
    ride = await db.get(Ride, ride_id)
    return RidePublic.model_validate(ride)


@router.post("/{ride_id}/reject", status_code=202)
async def reject_ride(
    ride_id: uuid.UUID,
    driver: Driver = Depends(get_current_driver),
):
    if not ride_service.driver_reject(str(ride_id), str(driver.id)):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "no pending offer for you on this ride"
        )
    return {"detail": "rejected"}


@router.post("/{ride_id}/decline", status_code=200)
async def decline_assigned_ride(
    ride_id: uuid.UUID,
    driver: Driver = Depends(get_current_driver),
):
    """Decline a ride that was assigned to you (admin force-assign or accepted
    offer) before pickup. Returns the ride to dispatch, skipping you."""
    if not await ride_service.decline_assigned(str(ride_id), str(driver.id)):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "cannot decline this ride"
        )
    return {"detail": "declined", "status": "reassigning"}


# ── Lifecycle transitions ─────────────────────────────────────────────


async def _driver_owns(db, ride_id: uuid.UUID, driver: Driver) -> Ride:
    ride = await db.get(Ride, ride_id)
    if ride is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ride not found")
    if ride.driver_id != driver.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not your ride")
    return ride


@router.post("/{ride_id}/arrived", response_model=RidePublic)
async def driver_arrived(
    ride_id: uuid.UUID,
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    await _driver_owns(db, ride_id, driver)
    try:
        ride = await ride_service.set_status(
            db, ride_id, "arrived", by_driver_id=driver.id
        )
    except ride_service.RideError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    return RidePublic.model_validate(ride)


@router.post("/{ride_id}/start", response_model=RidePublic)
async def start_ride(
    ride_id: uuid.UUID,
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    await _driver_owns(db, ride_id, driver)
    try:
        ride = await ride_service.set_status(
            db, ride_id, "ongoing", by_driver_id=driver.id
        )
    except ride_service.RideError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    return RidePublic.model_validate(ride)


@router.post("/{ride_id}/cancel", response_model=RidePublic)
async def cancel_ride(
    ride_id: uuid.UUID,
    payload: RideCancel,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ride = await _get_owned_ride(db, ride_id, user)
    by_driver = None
    by_passenger = None
    if ride.passenger_id == user.id:
        by_passenger = user.id
    else:
        drv = await db.get(Driver, ride.driver_id) if ride.driver_id else None
        by_driver = drv.id if drv else None
    try:
        ride = await ride_service.set_status(
            db, ride_id, "cancelled",
            by_driver_id=by_driver, by_passenger_id=by_passenger,
            cancel_reason=payload.reason,
        )
    except ride_service.RideError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    return RidePublic.model_validate(ride)


# ── Rating ────────────────────────────────────────────────────────────


@router.post("/{ride_id}/rate", status_code=201)
async def rate_ride(
    ride_id: uuid.UUID,
    payload: RatingCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ride = await _get_owned_ride(db, ride_id, user)
    if ride.status != "completed":
        raise HTTPException(status.HTTP_409_CONFLICT, "ride not completed")
    if ride.driver_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "ride had no driver")

    drv = await db.get(Driver, ride.driver_id)
    # Determine rater → ratee.
    if ride.passenger_id == user.id:
        to_user_id = drv.user_id
    else:
        to_user_id = ride.passenger_id

    existing = await db.execute(
        select(Rating).where(
            Rating.ride_id == ride_id, Rating.from_user_id == user.id
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "already rated")

    # Inserting the rating fires the DB trigger that recomputes driver.rating.
    db.add(Rating(
        ride_id=ride_id, from_user_id=user.id, to_user_id=to_user_id,
        score=payload.score, comment=payload.comment,
    ))
    await db.commit()
    return {"detail": "rated"}
