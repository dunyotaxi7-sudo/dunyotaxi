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
    """Coordinates a broadcast ride offer.

    An order is offered to several drivers at once. The dispatcher opens the
    offer with the set of offered drivers and awaits :meth:`wait`; each driver's
    accept/reject HTTP call feeds :meth:`accept` / :meth:`reject`. The FIRST
    accept wins (later accepts get False → the driver sees "already taken"), and
    the offer also resolves — with no winner — once every offered driver has
    rejected, so the dispatcher can move on without waiting out the timeout.
    """

    def __init__(self) -> None:
        self._events: dict[str, asyncio.Event] = {}
        self._winner: dict[str, str | None] = {}
        self._pending: dict[str, set[str]] = {}

    def open(self, ride_id: str, driver_ids: set[str]) -> None:
        self._events[ride_id] = asyncio.Event()
        self._winner.pop(ride_id, None)
        self._pending[ride_id] = set(driver_ids)

    def accept(self, ride_id: str, driver_id: str) -> bool:
        """First accept wins. Returns False if the offer is already resolved
        (someone accepted first, or it timed out / was cancelled)."""
        ev = self._events.get(ride_id)
        if ev is None or ev.is_set():
            return False
        self._winner[ride_id] = driver_id
        ev.set()
        return True

    def reject(self, ride_id: str, driver_id: str) -> bool:
        """Record a reject; if every offered driver has now rejected, resolve
        with no winner. Returns False if the offer is already resolved."""
        ev = self._events.get(ride_id)
        if ev is None or ev.is_set():
            return False
        pending = self._pending.get(ride_id)
        if pending is not None:
            pending.discard(driver_id)
            if not pending:
                self._winner[ride_id] = None
                ev.set()
        return True

    async def wait(self, ride_id: str, timeout: float) -> str | None:
        """Await the outcome. Returns the winning driver id, or None on timeout
        / all-rejected."""
        ev = self._events.get(ride_id)
        if ev is None:
            return None
        try:
            await asyncio.wait_for(ev.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            pass
        finally:
            self._events.pop(ride_id, None)
            self._pending.pop(ride_id, None)
        return self._winner.pop(ride_id, None)

    def cancel(self, ride_id: str) -> None:
        self._events.pop(ride_id, None)
        self._winner.pop(ride_id, None)
        self._pending.pop(ride_id, None)


offer_broker = OfferBroker()
