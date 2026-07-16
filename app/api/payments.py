"""Payment router: complete a ride (creates payment; DB trigger settles wallet)."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_driver, get_current_user
from app.core.database import get_db
from app.models import Driver, Payment, Ride, User
from app.schemas.payment import PaymentCreate, PaymentPublic
from app.schemas.ride import RidePublic
from app.services import ride as ride_service

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/rides/{ride_id}/complete", response_model=RidePublic)
async def complete_ride(
    ride_id: uuid.UUID,
    payload: PaymentCreate,
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """Driver finishes the ride. We set status='completed' and write the payment
    row; the DB trigger handles commission + wallet bookkeeping."""
    ride = await db.get(Ride, ride_id)
    if ride is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ride not found")
    if ride.driver_id != driver.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not your ride")
    if payload.method not in {"cash", "payme", "click", "uzum", "wallet"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid payment method")
    try:
        ride = await ride_service.complete_ride(
            db, ride_id, payload.method, payload.external_id
        )
    except ride_service.RideError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    return RidePublic.model_validate(ride)


@router.get("/rides/{ride_id}", response_model=PaymentPublic)
async def get_payment(
    ride_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ride = await db.get(Ride, ride_id)
    if ride is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ride not found")
    # Only the passenger, assigned driver, or an admin may view.
    allowed = user.role == "admin" or ride.passenger_id == user.id
    if not allowed and ride.driver_id is not None:
        drv = await db.get(Driver, ride.driver_id)
        allowed = bool(drv and drv.user_id == user.id)
    if not allowed:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed")

    res = await db.execute(select(Payment).where(Payment.ride_id == ride_id))
    payment = res.scalar_one_or_none()
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no payment for this ride")
    return PaymentPublic.model_validate(payment)
