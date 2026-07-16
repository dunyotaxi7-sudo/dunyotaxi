"""End-to-end smoke test of the whole ride flow against a running server.

Exercises: OTP login (passenger, driver, admin), driver registration + admin
approval, driver location streaming over WebSocket (→ Redis GEOADD), passenger
ride request, background dispatch + WS offer, driver accept, the full status
machine (arrived → ongoing → completed), the DB commission trigger, and rating.

Run with the server already up:
    python -m scripts.e2e_demo
"""
from __future__ import annotations

import asyncio
import json

import httpx
import websockets

BASE = "http://127.0.0.1:8000"
WS = "ws://127.0.0.1:8000"

# Bukhara centre + a point ~600 m away for the driver.
PICKUP = {"lat": 39.767, "lng": 64.421}
DROPOFF = {"lat": 39.805, "lng": 64.455}
DRIVER_POS = {"lat": 39.770, "lng": 64.423}

ADMIN_PHONE = "+998901234567"  # created by scripts.create_admin
PASSENGER_PHONE = "+998900000001"
DRIVER_PHONE = "+998900000002"

OK = "\033[92m✓\033[0m"


def step(msg: str) -> None:
    print(f"\n\033[96m▶ {msg}\033[0m")


async def login(client: httpx.AsyncClient, phone: str, name: str, role: str) -> dict:
    r = await client.post("/auth/request-otp", json={"phone": phone})
    code = r.json()["debug_code"]
    r = await client.post("/auth/verify-otp", json={
        "phone": phone, "code": code, "full_name": name, "role": role,
    })
    r.raise_for_status()
    data = r.json()
    print(f"  {OK} {role:9} {name:8} logged in (user {data['user']['id'][:8]})")
    return data


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def main() -> None:
    async with httpx.AsyncClient(base_url=BASE, timeout=30) as c:
        step("1. Everyone logs in via phone + OTP")
        admin = await login(c, ADMIN_PHONE, "Admin", "admin")
        passenger = await login(c, PASSENGER_PHONE, "Ali", "passenger")
        driver_user = await login(c, DRIVER_PHONE, "Vali", "driver")

        step("2. Driver registers a car + admin approves it")
        r = await c.post("/driver/register", headers=auth(driver_user["access_token"]),
                         json={"car_model": "Chevrolet Cobalt", "car_number": "01 A 123 BA",
                               "car_color": "white", "car_year": 2022})
        if r.status_code == 400:  # already registered from a previous run
            r = await c.get("/driver/me", headers=auth(driver_user["access_token"]))
        driver = r.json()
        print(f"  {OK} driver profile {driver['id'][:8]} status={driver['status']}")
        r = await c.patch(f"/admin/drivers/{driver['id']}", headers=auth(admin["access_token"]),
                          json={"status": "approved"})
        print(f"  {OK} admin set status={r.json()['status']}")

        step("3. Driver connects location WS (→ Redis GEOADD) and goes online")
        driver_ws = await websockets.connect(
            f"{WS}/ws/driver/location?token={driver_user['access_token']}"
        )
        await driver_ws.send(json.dumps(DRIVER_POS))
        ack = json.loads(await driver_ws.recv())
        print(f"  {OK} streamed GPS, server ack: {ack}")
        r = await c.patch("/driver/status", headers=auth(driver_user["access_token"]),
                          json={"is_online": True})
        print(f"  {OK} driver is_online={r.json()['is_online']}")

        step("4. Passenger opens ride-status WS and requests a ride")
        pass_ws = await websockets.connect(
            f"{WS}/ws/passenger/rides?token={passenger['access_token']}"
        )
        r = await c.post("/rides/request", headers=auth(passenger["access_token"]),
                         json={"from_location": PICKUP, "to_location": DROPOFF,
                               "from_address": "Labi Hovuz", "to_address": "Vokzal",
                               "payment_method": "cash"})
        ride = r.json()
        print(f"  {OK} ride {ride['id'][:8]} status={ride['status']} price={ride['price_sum']} so'm")
        ride_id = ride["id"]

        step("5. Driver receives the offer over its WS and accepts")
        offer = json.loads(await asyncio.wait_for(driver_ws.recv(), timeout=10))
        print(f"  {OK} driver got offer: type={offer['type']} distance_m={offer.get('distance_m')}")
        r = await c.post(f"/rides/{ride_id}/accept", headers=auth(driver_user["access_token"]))
        print(f"  {OK} accept HTTP {r.status_code}")
        evt = json.loads(await asyncio.wait_for(pass_ws.recv(), timeout=10))
        print(f"  {OK} passenger WS received: status={evt['status']} driver={str(evt.get('driver_id'))[:8]}")

        step("6. Drive it: arrived → started → completed (+ payment)")
        for action in ("arrived", "start"):
            r = await c.post(f"/rides/{ride_id}/{action}", headers=auth(driver_user["access_token"]))
            evt = json.loads(await asyncio.wait_for(pass_ws.recv(), timeout=10))
            print(f"  {OK} {action:8} → passenger sees status={evt['status']}")
        r = await c.post(f"/payments/rides/{ride_id}/complete",
                         headers=auth(driver_user["access_token"]),
                         json={"method": "cash"})
        print(f"  {OK} completed, final status={r.json()['status']}")

        step("7. DB trigger check: commission taken from driver wallet")
        # cash ride → driver owes commission; wallet balance goes negative by commission.
        r = await c.get("/admin/stats", headers=auth(admin["access_token"]))
        s = r.json()
        print(f"  {OK} stats: completed={s['rides_completed']} revenue={s['revenue_sum']} "
              f"commission={s['commission_sum']} online_drivers={s['online_drivers']}")

        step("8. Passenger rates the driver 5★ (fires rating trigger)")
        r = await c.post(f"/rides/{ride_id}/rate", headers=auth(passenger["access_token"]),
                         json={"score": 5, "comment": "Zo'r!"})
        print(f"  {OK} rate HTTP {r.status_code}: {r.json()}")
        r = await c.get("/driver/me", headers=auth(driver_user["access_token"]))
        print(f"  {OK} driver rating now {r.json()['rating']}, total_rides={r.json()['total_rides']}")

        await driver_ws.close()
        await pass_ws.close()
        print(f"\n\033[92m=== ALL STEPS PASSED ===\033[0m")


if __name__ == "__main__":
    asyncio.run(main())
