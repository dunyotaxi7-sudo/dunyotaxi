# Bukhara Taxi — FastAPI Backend

Build the backend for a taxi-hailing service operating in Bukhara region, Uzbekistan. 
It works like Yandex Go but simpler: pricing is a straightforward km × rate calculation. 
The system serves three clients: a passenger mobile app (iOS/Android), a driver mobile 
app (iOS/Android), and a web admin panel.

## Tech Stack
- Python 3.11+ with FastAPI
- PostgreSQL with PostGIS extension (for GPS geography types)
- Redis for: real-time driver locations (GEO commands) and OTP codes (2-min TTL)
- SQLAlchemy 2.0 (async) + Alembic for migrations
- Pydantic v2 for schemas
- WebSocket for real-time ride status + driver location streaming
- JWT-based auth (phone + SMS OTP login flow)

## Database
I already have a complete PostgreSQL schema (attached as buxoro_taxi_schema.sql). 
Use it as the source of truth. It contains 17 tables across 5 blocks (users, rides, 
finance, bonus/promo, system) plus 3 triggers (rating update, ride completion 
commission, bonus payout). Convert these tables into SQLAlchemy async models and 
set up Alembic. Do NOT recreate the triggers in Python — they already live in the DB.

## Project Structure
Use a clean modular layout:
app/
  core/        (config, security, database, redis)
  models/      (SQLAlchemy models)
  schemas/     (Pydantic request/response)
  api/         (routers, grouped by domain)
  services/    (business logic)
  websockets/  (real-time handlers)
main.py

## Core Features to Implement (in this order)

### 1. Auth
- POST /auth/request-otp — send SMS OTP to phone (store code in Redis, 2-min TTL)
- POST /auth/verify-otp — verify code, create user if new, return JWT
- Roles: passenger, driver, admin

### 2. Driver
- Driver registration + document upload (status: pending → approved)
- PATCH /driver/status — go online/offline
- WebSocket /ws/driver/location — driver streams GPS every 5s; 
  store in Redis with GEOADD (key: "drivers:online")

### 3. Ride lifecycle (the core)
- POST /rides/estimate — calculate price from pricing_config: 
  base_fare for first base_km, then price_per_km per extra km, 
  apply night_multiplier between night_start and night_end
- POST /rides/request — create ride (status: searching), then find nearest driver
- Nearest driver: use Redis GEORADIUS on "drivers:online" within 3km, 
  expand to 5km then 8km if none found. Rank by distance, then rating.
- Driver accept/reject (30s timeout → try next driver)
- Status transitions: searching → accepted → arrived → ongoing → completed/cancelled
- Push status changes to passenger via WebSocket

### 4. Payments
- Support: cash, payme, click, uzum, wallet
- On ride completion, the DB trigger handles commission + wallet automatically. 
  Just update ride status to 'completed' and create the payment record.

### 5. Admin panel API
- Driver management (approve/reject documents, block/suspend)
- Real-time map: list all online drivers with current locations (from Redis)
- Pricing config CRUD
- Commission config (global + per-driver)
- Bonus campaigns + promo codes CRUD
- Stats: rides count, revenue, active drivers
- Log every admin action to admin_audit_logs

## Important Notes
- All money values are integers in so'm (Uzbek currency), never floats.
- Phone format: +998XXXXXXXXX
- Use PostGIS GEOGRAPHY(POINT, 4326) for stored locations; 
  Redis GEO for live driver positions.
- Keep pricing logic in a service so admin can change rates without code changes.
- Write the nearest-driver matching as a dedicated, well-tested service.

Start by setting up the project skeleton, core config, database connection, 
Redis connection, and the SQLAlchemy models from my schema. Then we'll build 
features one block at a time.