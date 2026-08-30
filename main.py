"""Dunyo Taxi — FastAPI application entrypoint.

Run locally:
    uvicorn main:app --reload
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.api import admin, auth, driver, notifications, payments, rides
from app.core.config import settings
from app.core.signed_url import verify as verify_upload
from app.core.database import AsyncSessionLocal
from app.core.redis_client import close_redis, get_redis
from app.services import ride as ride_service
from app.services import service_area
from app.services.service_area import OutsideServiceArea
from app.websockets import routes as ws_routes

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm the Redis connection and fail fast if it's unreachable.
    r = get_redis()
    try:
        await r.ping()
        logging.getLogger("startup").info("Redis OK")
    except Exception:  # noqa: BLE001
        logging.getLogger("startup").warning("Redis ping failed at startup")
    # Cache the service-area boundary in memory for fast point checks.
    async with AsyncSessionLocal() as db:
        await service_area.load(db)
    # Resume/cancel any rides left 'searching' by a previous process stop.
    try:
        await ride_service.recover_searching_rides()
    except Exception:  # noqa: BLE001
        logging.getLogger("startup").exception("searching-ride recovery failed")
    yield
    await close_redis()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Taxi-hailing backend for the Bukhara region (Uzbekistan).",
    lifespan=lifespan,
)

@app.exception_handler(OutsideServiceArea)
async def _outside_service_area(request: Request, exc: OutsideServiceArea):
    """Both ride endpoints reject locations outside the region with this shape."""
    return JSONResponse(
        status_code=400,
        content={
            "error": "outside_service_area",
            "point": exc.point,  # "pickup" | "destination"
            "message": "Xizmat faqat Buxoro viloyati ichida ishlaydi.",
        },
    )


app.add_middleware(
    CORSMiddleware,
    # Dev defaults to "*"; production sets CORS_ORIGINS to the admin origin.
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST routers
app.include_router(auth.router)
app.include_router(driver.router)
app.include_router(rides.router)
app.include_router(payments.router)
app.include_router(notifications.router)
app.include_router(admin.router)

# WebSocket routes
app.include_router(ws_routes.router)

# Serve uploaded driver documents — PRIVATE. Passport/ID/car photos are not
# publicly accessible: the URL must carry a valid short-lived signature (handed
# out only in authenticated API responses, see schemas.driver.DocumentPublic).
_uploads = Path("uploads")
_uploads.mkdir(exist_ok=True)


@app.get("/uploads/{path:path}", include_in_schema=False)
async def serve_upload(path: str, request: Request):
    full = f"/uploads/{path}"
    if not verify_upload(
        full, request.query_params.get("exp"), request.query_params.get("sig")
    ):
        raise HTTPException(status_code=403, detail="forbidden")
    base = _uploads.resolve()
    target = (base / path).resolve()
    # Guard against path traversal and only serve real files.
    if not str(target).startswith(str(base) + "/") or not target.is_file():
        raise HTTPException(status_code=404, detail="not found")
    return FileResponse(target)


@app.get("/health", tags=["system"])
async def health():
    r = get_redis()
    try:
        await r.ping()
        redis_ok = True
    except Exception:  # noqa: BLE001
        redis_ok = False
    return {"status": "ok", "redis": redis_ok, "env": settings.environment}
