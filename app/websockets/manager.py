"""In-process WebSocket connection registries + a simple ride-offer broker.

Single-process design: state lives in memory. For multi-worker deployments
this would be backed by Redis pub/sub, but the interface below is what the rest
of the app codes against, so swapping the transport later is localized.
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict

from fastapi import WebSocket

log = logging.getLogger("ws")


class ConnectionRegistry:
    """Maps a user-id (str) to their active WebSocket connections."""

    def __init__(self) -> None:
        self._conns: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, key: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._conns[key].add(ws)

    async def disconnect(self, key: str, ws: WebSocket) -> None:
        async with self._lock:
            self._conns.get(key, set()).discard(ws)
            if not self._conns.get(key):
                self._conns.pop(key, None)

    async def send(self, key: str, message: dict) -> bool:
        """Send JSON to all of a user's connections. Returns True if delivered."""
        delivered = False
        for ws in list(self._conns.get(key, set())):
            try:
                await ws.send_json(message)
                delivered = True
            except Exception:  # noqa: BLE001 — drop dead sockets
                await self.disconnect(key, ws)
        return delivered

    def is_connected(self, key: str) -> bool:
        return bool(self._conns.get(key))


# Passengers receive ride-status events here.
passenger_ws = ConnectionRegistry()
# Drivers receive ride-offer / cancellation events here.
driver_ws = ConnectionRegistry()


class Broadcaster:
    """Fan-out registry — every connected socket receives every message.
    Used for the admin live-orders board."""

    def __init__(self) -> None:
        self._conns: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._conns.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._conns.discard(ws)

    async def broadcast(self, message: dict) -> None:
        for ws in list(self._conns):
            try:
                await ws.send_json(message)
            except Exception:  # noqa: BLE001 — drop dead sockets
                await self.disconnect(ws)


# Admins receive live-order change events here.
admin_ws = Broadcaster()


class OfferBroker:
    """Coordinates a single outstanding ride offer per driver.

    The dispatcher pushes an offer and awaits :meth:`wait`; the driver's
    accept/reject HTTP call resolves it via :meth:`resolve`.
    """

    def __init__(self) -> None:
        self._events: dict[str, asyncio.Event] = {}
        self._results: dict[str, bool] = {}

    def open(self, ride_id: str) -> asyncio.Event:
        ev = asyncio.Event()
        self._events[ride_id] = ev
        self._results.pop(ride_id, None)
        return ev

    def resolve(self, ride_id: str, accepted: bool) -> bool:
        """Record a driver's decision. Returns False if no offer is pending."""
        ev = self._events.get(ride_id)
        if ev is None:
            return False
        self._results[ride_id] = accepted
        ev.set()
        return True

    async def wait(self, ride_id: str, timeout: float) -> bool | None:
        """Await a decision. Returns True/False, or None on timeout."""
        ev = self._events.get(ride_id)
        if ev is None:
            return None
        try:
            await asyncio.wait_for(ev.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            return None
        finally:
            self._events.pop(ride_id, None)
        return self._results.pop(ride_id, None)

    def cancel(self, ride_id: str) -> None:
        self._events.pop(ride_id, None)
        self._results.pop(ride_id, None)


offer_broker = OfferBroker()
