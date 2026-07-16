# Bukhara Taxi — How to Run (Backend · Admin · Mobile)

A step-by-step guide to start the whole platform locally on macOS.

There are **3 apps** + **2 datastores**:

| Part | Tech | Port |
|------|------|------|
| PostgreSQL (+PostGIS) | Homebrew `postgresql@17` | **5433** |
| Redis | `redis-server` | **6379** |
| Backend API | FastAPI (Python 3.14, `.venv`) | **8001** |
| Admin panel | Next.js | **3001** |
| Mobile (passenger + driver) | Expo / React Native | Metro **8081** |

> Ports 8000 and 3000 are intentionally avoided (other apps use them). The Google Maps key is allow-listed for `localhost:3001`, so keep the admin on **3001**.

---

## 0. One-time prerequisites

You already have these, but for a fresh machine:

- **Homebrew** — https://brew.sh
- **PostgreSQL 17 + PostGIS**: `brew install postgresql@17 postgis`
- **Redis**: `brew install redis`
- **Python 3.14** (repo uses a `.venv` in the project root)
- **Node.js** (v24) + npm — `brew install node`
- **Android Studio** (for the emulator + Java runtime), or Xcode for iOS

Google Maps keys are already filled into the `.env` files.

---

## 1. Start the datastores (PostgreSQL + Redis)

```bash
# PostgreSQL — configured to listen on port 5433
brew services start postgresql@17

# Redis — on port 6379 (runs in the background, survives until reboot)
redis-server --port 6379 --daemonize yes
```

**Verify:**

```bash
# Postgres up on 5433?
lsof -ti :5433 && echo "pg OK"

# Redis responds?
redis-cli ping        # → PONG

# Database exists with data?
/opt/homebrew/opt/postgresql@17/bin/psql -p 5433 -U a1234 -d buxoro_taxi -c "SELECT count(*) FROM users;"
```

### Redis — if it won't connect

The backend needs Redis (live driver positions, ride offers, OTP). If `curl .../health`
shows `"redis":false`, or `redis-cli ping` errors with *"Could not connect to Redis"*,
start it:

```bash
# Quick start (one-off, backgrounded — does NOT auto-start after a reboot):
redis-server --port 6379 --daemonize yes
redis-cli ping        # → PONG
```

Notes / gotchas on this machine:
- Redis is installed (`/opt/homebrew/bin/redis-server`) but **not registered as a brew
  service**, so `brew services start redis` fails with *"Formula `redis` is not installed"*.
  Use the `redis-server --daemonize` command above instead.
- To make it **auto-start on login** (optional): `brew services start redis` only works if
  the formula is registered — otherwise just re-run the `redis-server` command after a reboot.
- Already-in-use check: `lsof -ti :6379` (if something's there, Redis is already up).
- Stop it: `redis-cli shutdown`.
- After starting Redis, **restart the backend** if it was already running so it reconnects.

> **If Postgres won't start** with an "address already in use" error, another Postgres (e.g. EnterpriseDB PG18) is on port 5432. That's fine — `postgresql@17` is pinned to **5433** in its `postgresql.conf`, which is what `DATABASE_URL` expects. If needed, confirm the config has `port = 5433`.

> **First-time DB setup only** (skip if `buxoro_taxi` already exists): create the DB and load the schema:
> ```bash
> /opt/homebrew/opt/postgresql@17/bin/createdb -p 5433 buxoro_taxi
> /opt/homebrew/opt/postgresql@17/bin/psql -p 5433 -d buxoro_taxi -c "CREATE EXTENSION IF NOT EXISTS postgis;"
> .venv/bin/alembic upgrade head          # apply migrations
> # optional demo/seed data:
> .venv/bin/python scripts/load_service_area.py   # loads the Bukhara region polygon
> ```

---

## 2. Start the Backend (FastAPI, port 8001)

```bash
cd /Users/a1234/Desktop/Bukhara-taxi

# First time only — create venv + install deps:
#   python3 -m venv .venv
#   .venv/bin/pip install -r requirements.txt

# Run the API (auto-reload on code changes):
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

**Verify:**

```bash
curl http://127.0.0.1:8001/health
# → {"status":"ok","redis":true,"env":"development"}
```

- API docs (Swagger): http://127.0.0.1:8001/docs
- Config lives in the root **`.env`** (`DATABASE_URL`, `REDIS_URL`, `DRIVER_ACCEPT_TIMEOUT_SECONDS=15`, `MIN_DRIVER_BALANCE=-15000`, …).

Leave this terminal running.

---

## 3. Start the Admin panel (Next.js, port 3001)

Open a **new terminal**:

```bash
cd /Users/a1234/Desktop/Bukhara-taxi/admin

# First time only:
#   npm install

# Run on port 3001 (NOT 3000 — Maps key is allow-listed for :3001):
npm run dev -- -p 3001
```

**Open:** http://localhost:3001

- Config: **`admin/.env.local`** (`NEXT_PUBLIC_API_URL=http://127.0.0.1:8001`, Maps key, `NEXT_PUBLIC_MAPS_LANGUAGE=uz`).
- **Login:** enter an admin phone (e.g. `+998901234567`). In development the OTP **code is shown on the verify screen** ("Test kodi") — type it in. (Real SMS is not wired up locally; the mock provider just displays the code.)

Leave this terminal running.

---

## 4. Start the Mobile app (Expo — passenger + driver)

The passenger and driver apps are **one Expo app**; the role is chosen on the first screen.

> ⚠️ **This app does NOT run in Expo Go.** It uses native modules (maps, background location, push notifications) that Expo Go dropped in SDK 53. You must use the **development build** (`com.anonymous.mobile`), which is already installed on the emulators. Always start Metro with **`--dev-client`**.

### 4a. Start Metro (bundler)

Open a **new terminal**:

```bash
cd /Users/a1234/Desktop/Bukhara-taxi/mobile

# First time only:
#   npm install

# Start Metro targeting the dev build (‑c clears cache so .env changes load):
npx expo start -c --dev-client
```

- Config: **`mobile/.env`**
  - `EXPO_PUBLIC_API_URL=http://10.0.2.2:8001` — `10.0.2.2` is how the **Android emulator** reaches your Mac's `localhost`.
    - iOS simulator: use `http://127.0.0.1:8001`.
    - Real phone: use your Mac's **LAN IP**, e.g. `http://192.168.0.169:8001` (phone must be on the same Wi‑Fi).
  - `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, `EXPO_PUBLIC_MAPS_LANGUAGE=uz`.

### 4b. Launch on the Android emulator

Start an emulator (from Android Studio ▸ Device Manager, or CLI):

```bash
# List available AVDs:
~/Library/Android/sdk/emulator/emulator -list-avds
#   Medium_Phone
#   Pixel_10_Pro

# Launch one (keep this terminal open):
~/Library/Android/sdk/emulator/emulator -avd Pixel_10_Pro
```

Then in the **Metro terminal**, press **`a`** to open the app on Android — it launches the installed **dev build** (`com.anonymous.mobile`), not Expo Go.

- If the dev build isn't installed, build & install it once (see **Troubleshooting** below).
- You can also just tap the app's icon on the emulator — it auto-connects to Metro.
- iOS: press **`i`** in Metro (requires Xcode).

### 4c. Use it

1. App opens on the **role screen** → pick **Yo'lovchi** (passenger) or **Haydovchi** (driver).
2. Enter a phone → the **OTP code is shown on the screen** (dev mode) → enter it.
3. Passenger: set pickup/destination → see price → order.
   Driver: a new account lands on **registration → document upload → pending approval** (approve it from the admin panel).

---

## Quick start (everything, in order)

```bash
# 1. datastores
brew services start postgresql@17
redis-server --port 6379 --daemonize yes

# 2. backend           (terminal 1)
cd /Users/a1234/Desktop/Bukhara-taxi
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8001 --reload

# 3. admin             (terminal 2)
cd /Users/a1234/Desktop/Bukhara-taxi/admin && npm run dev -- -p 3001

# 4. mobile            (terminal 3) — dev build, NOT Expo Go
cd /Users/a1234/Desktop/Bukhara-taxi/mobile && npx expo start -c --dev-client
#    + start an emulator, then press `a` in Metro
```

URLs: API `http://127.0.0.1:8001/docs` · Admin `http://localhost:3001` · Metro `http://localhost:8081`

---

## Stopping everything

```bash
# backend / admin / metro: press Ctrl+C in each terminal, or:
lsof -ti :8001 | xargs kill      # backend
lsof -ti :3001 | xargs kill      # admin
lsof -ti :8081 | xargs kill      # metro

# datastores (optional — usually left running):
brew services stop postgresql@17
redis-cli shutdown
```

---

## Troubleshooting

**Backend: `redis:false` or connection refused**
Redis isn't running — `redis-server --port 6379 --daemonize yes`, then `redis-cli ping`.

**Backend won't connect to the DB**
Postgres isn't up on 5433, or the DB/extension is missing. Check `lsof -ti :5433` and that `DATABASE_URL` in `.env` points to `localhost:5433/buxoro_taxi`.

**Admin map is blank / "Failed to load Google Maps"**
Make sure the admin runs on **:3001** (the Maps key is referrer-restricted to `http://localhost:3001`), and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set in `admin/.env.local`.

**Mobile can't reach the API**
Match `EXPO_PUBLIC_API_URL` to the target: emulator → `10.0.2.2:8001`, iOS sim → `127.0.0.1:8001`, real device → your LAN IP. Restart Metro with `-c` after changing `.env`.

**"expo-notifications … removed from Expo Go … Use a development build"**
You opened the app in **Expo Go**. This project requires the **dev build**. Start Metro with `npx expo start -c --dev-client`, then press `a` (or tap the `com.anonymous.mobile` app icon on the emulator). Don't scan the QR with the Expo Go app.

**Mobile map crashes / blank on Android**
The native build needs the Google Maps key in its manifest. Rebuild the dev client:
```bash
cd mobile
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
npx expo run:android      # builds, installs, and launches the dev build
```
(That `JAVA_HOME` is required for Gradle if `java` isn't otherwise on your PATH.)

**"SMS sent" but no code arrives**
Expected locally — there's no real SMS provider. The **OTP code is displayed on the verify screen** (dev mode). Use that.

**Emulator gets killed / won't stay open**
Launch it yourself from Android Studio's Device Manager and leave that window open, then press `a` in Metro.

---

## Handy test accounts (dev)

- **Admin:** `+998901234567` (OTP shown on screen)
- Approved **driver:** `+998900000002`

Everything runs against the local Postgres (`buxoro_taxi` on 5433) and Redis (6379).
