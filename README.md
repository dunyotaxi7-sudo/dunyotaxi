# Bukhara Taxi — FastAPI Backend

Backend for a taxi-hailing service in the Bukhara region, Uzbekistan. Works like
Yandex Go but with simple `km × rate` pricing. Serves three clients: passenger
app, driver app, and a web admin panel.

## Stack

- **Python 3.11+ / FastAPI**
- **PostgreSQL + PostGIS** — stored locations as `GEOGRAPHY(POINT, 4326)`
- **Redis** — live driver positions (GEO commands) + OTP codes (2-min TTL)
- **SQLAlchemy 2.0 async + Alembic**
- **Pydantic v2**
- **WebSockets** — ride status + driver location streaming
- **JWT auth** — phone + SMS OTP login

All money is **integer so'm** — never floats. Phone format `+998XXXXXXXXX`.

## Layout

```
app/
  core/        config, database (async), redis client, security (JWT)
  models/      SQLAlchemy models — mirror of buxoro_taxi_schema.sql
  schemas/     Pydantic request/response
  api/         routers: auth, driver, rides, payments, admin (+ deps)
  services/    business logic: otp, auth, pricing, matching, ride, driver, admin
  websockets/  connection registries + /ws routes
main.py        app wiring + lifespan + /health
alembic/       migrations (baseline applies the source schema incl. triggers)
scripts/       create_admin.py
tests/         matching + pricing unit tests
```

The database schema in `buxoro_taxi_schema.sql` is the **source of truth** (17
tables, 3 triggers). The three triggers — driver-rating update, ride-completion
commission/wallet, bonus payout — live in the DB and are **not** reimplemented
in Python. The app simply inserts rows (ratings, the `completed` ride status)
and lets the triggers do the bookkeeping.

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then edit DATABASE_URL / REDIS_URL / JWT_SECRET

# Create the database (with PostGIS) then apply the schema + migrations:
createdb buxoro_taxi
psql buxoro_taxi -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS postgis;'
alembic upgrade head           # baseline migration applies buxoro_taxi_schema.sql

# Bootstrap an admin (not creatable via the public OTP flow):
python -m scripts.create_admin +998901234567 "Bosh admin"

# Run:
uvicorn main:app --reload
```

Interactive docs at `http://localhost:8000/docs`.

> **Note on migrations:** the baseline `0001_initial_schema` executes the
> original SQL file verbatim (tables + indexes + triggers + seed rows). Future
> schema changes use normal `alembic revision --autogenerate` against the
> models. If you prefer to load the schema by hand (`psql -f
> buxoro_taxi_schema.sql`), then run `alembic stamp head` to mark the baseline
> as applied.

## Auth flow

1. `POST /auth/request-otp` `{phone}` → OTP stored in Redis (`otp:<phone>`,
   2-min TTL) and "sent" (the `mock` SMS provider logs it; in dev the code is
   also returned as `debug_code`).
2. `POST /auth/verify-otp` `{phone, code, full_name?, role?}` → verifies the
   code, creates the user + wallet on first login, returns an access/refresh
   JWT pair. Roles: `passenger`, `driver`, `admin` (admin only via script).
3. Bearer-token all other endpoints; `POST /auth/refresh` to rotate tokens.

## Ride lifecycle

```
searching → accepted → arrived → ongoing → completed
          ↘ cancelled (any active state)
```

- `POST /rides/estimate` — fare from `pricing_config`: `base_fare` covers the
  first `base_km`, then `price_per_km` per extra km, `night_multiplier` applied
  between `night_start`/`night_end`, floored at `min_price`. Promo codes apply a
  discount on top.
- `POST /rides/request` — creates the ride (`searching`) and starts background
  **dispatch**.
- **Matching** (`services/matching.py`): Redis `GEOSEARCH` on `drivers:online`
  within **3 km → 5 km → 8 km** (first non-empty ring wins), filtered to
  `approved` drivers, **ranked by distance then rating**. The pure ranking step
  is unit-tested.
- The dispatcher offers the ride to the nearest driver over their WebSocket and
  waits up to `DRIVER_ACCEPT_TIMEOUT_SECONDS` (30 s). On reject/timeout it tries
  the next driver; if none remain, the ride is auto-cancelled (`system`,
  `no_driver_found`).
- Driver: `POST /rides/{id}/accept|reject`, then `…/arrived`, `…/start`.
- Passenger status changes are pushed over `/ws/passenger/rides`.

## Payments

`POST /payments/rides/{id}/complete` `{method, external_id?}` — sets the ride to
`completed` and writes the `payments` row. The DB trigger
`process_ride_completion` then computes commission (per-driver override falling
back to global) and updates the driver's wallet. Methods: `cash`, `payme`,
`click`, `uzum`, `wallet`.

## Admin panel API (`/admin/*`, admin-only, every action audited)

- Driver moderation: `PATCH /admin/drivers/{id}` (approve/reject/suspend),
  `PATCH /admin/documents/{id}`, `PATCH /admin/users/{id}/block`.
- Live map: `GET /admin/map/online-drivers` (positions from Redis + car/rating).
- Pricing CRUD: `GET/POST/PATCH /admin/pricing`.
- Commission config: `GET/POST /admin/commission` (global or per-driver).
- Bonus campaigns: `GET/POST/PATCH /admin/bonus-campaigns`.
- Promo codes: `GET/POST/PATCH /admin/promo-codes`.
- Stats: `GET /admin/stats` (rides, revenue, commission, active/online drivers).
- Audit trail: `GET /admin/audit-logs`. Every mutating admin action is written
  to `admin_audit_logs` with old/new JSON values and IP.

## WebSockets

Authenticate with `?token=<access_jwt>`.

- `GET /ws/driver/location` — driver sends `{"lat":.., "lng":..}` (~every 5 s);
  the server `GEOADD`s to `drivers:online`. Ride offers/cancellations are
  relayed to the driver on the same socket. Last point is persisted to PostGIS
  on disconnect.
- `GET /ws/passenger/rides` — passenger receives `ride_status` events.

## Tests

```bash
pytest            # 26 tests: matching ranking + expanding-radius (fakeredis), pricing
```

The matching and pricing services are pure where it matters, so they're tested
without a live DB.
