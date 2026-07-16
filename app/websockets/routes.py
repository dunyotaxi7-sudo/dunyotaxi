"""WebSocket endpoints.

  * /ws/driver/location — driver streams GPS (~every 5s); we GEOADD to Redis and
    also relay ride offers/cancellations to the driver over the same socket.
  * /ws/passenger/rides — passenger receives live ride-status events.
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.database import AsyncSessionLocal
from app.core.redis_client import get_redis
from app.services import driver as driver_service
from app.services import location
from app.services import ride as ride_service
from app.websockets.auth import authenticate_ws
from app.websockets.manager import admin_ws, driver_ws, passenger_ws

log = logging.getLogger("ws.routes")
router = APIRouter()


@router.websocket("/ws/driver/location")
async def driver_location(ws: WebSocket):
    async with AsyncSessionLocal() as db:
        user = await authenticate_ws(ws, db)
        if user is None:
            return
        driver = await driver_service.get_driver_by_user(db, user.id)
        if driver is None:
            await ws.close(code=1008)
            return
        driver_id = str(driver.id)
        # Let the ride service route ride events to this driver's socket.
        ride_service.cache_driver_user(driver_id, str(user.id))

    r = get_redis()
    await driver_ws.connect(str(user.id), ws)
    last: tuple[float, float] | None = None
    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
                lat = float(data["lat"])
                lng = float(data["lng"])
            except (ValueError, KeyError, TypeError):
                await ws.send_json({"type": "error", "detail": "expected {lat,lng}"})
                continue
            await ride_service.relay_driver_location(r, driver_id, lat, lng)
            last = (lat, lng)
            await ws.send_json({"type": "ack", "lat": lat, "lng": lng})
    except WebSocketDisconnect:
        pass
    finally:
        await driver_ws.disconnect(str(user.id), ws)
        # Persist the last-known point to PostGIS on disconnect.
        if last is not None:
            async with AsyncSessionLocal() as db:
                await driver_service.persist_last_location(
                    db, driver.id, last[0], last[1]
                )


@router.websocket("/ws/admin")
async def admin_events(ws: WebSocket):
    """Admin live-orders channel — receives a nudge whenever active orders
    change, so the board refreshes instantly instead of waiting for the poll."""
    async with AsyncSessionLocal() as db:
        user = await authenticate_ws(ws, db)
        if user is None:
            return
        if user.role != "admin":
            await ws.close(code=1008)
            return
    await admin_ws.connect(ws)
    try:
        while True:
            await ws.receive_text()  # client keep-alive pings
    except WebSocketDisconnect:
        pass
    finally:
        await admin_ws.disconnect(ws)


@router.websocket("/ws/passenger/rides")
async def passenger_rides(ws: WebSocket):
    async with AsyncSessionLocal() as db:
        user = await authenticate_ws(ws, db)
        if user is None:
            return
    await passenger_ws.connect(str(user.id), ws)
    try:
        while True:
            # Client keep-alive pings; we don't expect meaningful inbound data.
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await passenger_ws.disconnect(str(user.id), ws)
