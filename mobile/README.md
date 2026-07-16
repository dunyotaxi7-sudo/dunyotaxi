# Bukhara Taxi — Mobile (Expo)

Single Expo codebase serving **passenger** and **driver** apps, split by role.
Built stage-by-stage per `mobile_passenger_plan.md`.

## Stack
- Expo SDK 57 (dev build) + TypeScript
- Expo Router (file-based, route groups) with typed routes
- TanStack Query · Zustand · Axios
- `expo-secure-store` for JWT persistence

> Stack note: the plan named a generic Expo stack; `create-expo-app` installed
> SDK 57 / RN 0.86 / expo-router 57. Uses the `src/` app directory and the
> modern `Stack.Protected` guard API.

## Structure
```
src/
  app/
    _layout.tsx        root: query provider, auth hydration, Stack.Protected guards
    (auth)/            login, otp
    (passenger)/       passenger screens (home placeholder for now)
    (driver)/          driver screens (home placeholder; built later)
  components/
    Map/               ISOLATED map layer — see below
    ui/                Button, …
  lib/
    api/               client (axios + JWT interceptor + 401), auth endpoints
    config.ts          API base URL resolution
    storage.ts         SecureStore wrapper + in-memory token for the interceptor
    format.ts          so'm / phone formatters
    ws/                (WebSocket — later stages)
  store/auth.ts        Zustand auth store (hydrate / signIn / signOut)
  theme/colors.ts      palette
```

## Auth flow (Stage 1)
1. `login` — phone input locked to `+998XXXXXXXXX` → `POST /auth/request-otp`.
2. `otp` — 6-digit code with a 60s resend timer → `POST /auth/verify-otp` →
   receive JWT pair + user. In dev the code is shown on-screen (`debug_code`).
3. `signIn` persists tokens to SecureStore and sets the user. The root
   `Stack.Protected` guards then route to `(passenger)` or `(driver)` by
   `user.role`. On launch the session is restored from SecureStore before the
   UI decides which stack to show.
4. Any API `401` clears the session (interceptor → store), and the guard routes
   back to `login`.

## Run
The backend must be reachable. It currently runs on **port 8001** (see repo
root). Set the API URL for your device in `.env`:

```
EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:8001
```
(`.env` is preset to `http://192.168.0.166:8001`. On a **real device** it must
be the machine's LAN IP — `localhost` won't reach your computer. The simulator
falls back to `10.0.2.2` on Android / `127.0.0.1` on iOS automatically.)

```bash
cd mobile
npm install
npx expo start           # then press i (iOS), a (Android), or scan in a dev build
```

Log in with a phone; a passenger account is created on first verify. To test
the driver stack, log in with the driver phone used in the backend
(`+998900000002`).

## Map layer (Stage 2) — isolated

All `react-native-maps` code lives behind `components/Map/`. Nothing else may
import `react-native-maps` directly, so swapping to Yandex later means replacing
only this folder.

- `types.ts` — provider-agnostic `Coords` (`{lat,lng}`), `MapMarker`, `MapProps`
- `index.tsx` — the **only** file importing `react-native-maps`; the `<Map>`
  component (markers, `route` polyline, `initialCamera`, `onPress`,
  `onRegionChange`, imperative `animateTo`)
- `useCurrentLocation.ts` — `expo-location` hook returning `{lat,lng}` +
  permission state, with the denied case handled

Screens use only `Coords`/`MapMarker`/`<Map>` — never the provider's `Region`/
`LatLng` shapes (converted internally).

**Google Maps key:** iOS uses Apple Maps by default (no key needed for dev). For
Google tiles on Android you must add `android.config.googleMaps.apiKey` to
`app.json` and rebuild the dev client. Maps render only in a **dev build**, not
Expo Go.

## Verified
- `npx tsc --noEmit` → 0 errors
- `npx expo export` → bundles cleanly (1,341 modules with the map layer wired in)

## Passenger home + location picking (Stage 3)

- `(passenger)/index.tsx` — full-screen map with a bottom sheet. Shows the
  user's location and **nearby online drivers** as car markers, refreshed every
  10s via TanStack Query. "Qayerdan" is prefilled from the current position
  (reverse-geocoded); tapping either field opens the picker. "Narxni ko'rish"
  enables once both are set.
- `(passenger)/pick-location.tsx` — fixed centre pin over a draggable map; the
  centred point is reverse-geocoded (debounced) into an address, plus an address
  search box. Confirm writes the place into the ride-draft store.
- `store/ride.ts` — Zustand ride draft (`from` / `to` places) shared across
  screens.
- `components/Map/geocode.ts` — reverse/forward geocoding via `expo-location`,
  kept inside the isolated map layer.
- Backend: added `GET /rides/nearby-drivers?lat&lng` (positions from Redis GEO,
  filtered to approved+online drivers).

All map/geocode use goes through `components/Map` — no `react-native-maps`
imports in screens. `(passenger)/estimate.tsx` is a Stage-3 placeholder that
Stage 4 replaces.

## Fare confirmation (Stage 4)

- `(passenger)/estimate.tsx` — on mount calls `POST /rides/estimate` (loading /
  error states). Shows distance, duration, and price as `24 000 so'm`; draws the
  route polyline between pickup and destination and frames it (`map.fit`).
  Payment selector (Naqd / Payme / Click, default cash), and an optional promo
  code that re-estimates and shows the discounted price — or "kod ishlamadi" when
  it doesn't apply. "Buyurtma berish" → `POST /rides/request` → navigates to
  `(passenger)/searching/[rideId]`.
- `map.fit(points)` added to the Map handle to frame pickup + dropoff.

Note: the route polyline is a straight line pickup→destination (no Directions
API yet); the backend price uses great-circle distance to match.

`(passenger)/searching/[rideId].tsx` is a Stage-4 placeholder; Stage 5 makes it
WebSocket-driven.

## Driver search + WebSocket (Stage 5)

- `lib/ws/useRideSocket(rideId)` — subscribes to `/ws/passenger/rides?token=`,
  filters events to the ride, and handles connect / **exponential-backoff
  reconnect** / cleanup on unmount.
- `(passenger)/searching/[rideId].tsx` — pulsing radar animation +
  "Haydovchi qidirilmoqda…". Status comes from the socket **with a 5s
  `GET /rides/:id` poll as a backstop**, and an `AppState` listener refetches on
  resume (never trusts a stale socket). On `accepted` → the active-ride screen.
  On a system cancel (no driver) → "Haydovchi topilmadi" with **Qayta urinish**
  (re-requests) and **Bekor qilish**. A cancel button calls the cancel endpoint
  and returns home.
- Backend: the `ride_status` WS event now carries `cancelled_by` +
  `cancel_reason`, so the client distinguishes "no driver found" from a manual
  cancel.

`(passenger)/ride/[rideId].tsx` is a Stage-5 placeholder; Stage 6 builds the
full active-ride screen.

## Active ride (Stage 6)

- `(passenger)/ride/[rideId].tsx` — map with the driver's **live position**
  (relayed over the WS), pickup, destination and route; camera follows the
  driver smoothly. Bottom sheet driver card (name, car, plate, ★rating) with a
  **call button** (`Linking` `tel:`). Status banner in Uzbek (yo'lda → yetib
  keldi → davom etmoqda). Fare + payment method. Cancel only before the ride
  starts. On `completed` → rating screen; on `cancelled` → home.
- `useRideSocket` now also surfaces `driver_location` events.
- Backend: the driver-location WS relays each GPS point to the active ride's
  passenger; added `GET /rides/{id}/driver` for the card info. An in-memory
  driver→ride map (set on accept, cleared on complete/cancel) routes the relay.

`(passenger)/rating/[rideId].tsx` is a Stage-6 placeholder; Stage 7 builds it.

## Rating, profile & history (Stage 7)

- `(passenger)/rating/[rideId].tsx` — trip summary (driver, distance, price,
  payment), required 5-star selector, optional comment → `POST /rides/{id}/rate`
  → home. "Keyinroq" skips.
- `(passenger)/profile.tsx` — name (editable) + phone (read-only) + logout.
  Editing saves via `PATCH /auth/me` and updates the cached session.
- `(passenger)/history/` — `index` lists past rides (date, from→to, price,
  status) from `GET /rides/mine`; `[rideId]` shows the full read-only detail.
- Home screen gains top-left buttons for profile + history.
- Backend: added `PATCH /auth/me` (edit `full_name`).

## Push notifications (Stage 8)

- `lib/push.ts` — foreground handler + `registerForPush()` (asks permission
  *after login*, gets the Expo token, POSTs it to `/notifications/register-token`).
  Degrades gracefully on simulators / when no EAS `projectId` is configured.
- `components/PushManager.tsx` — mounted in `(passenger)/_layout`; registers the
  device and deep-links ride notifications to the right screen in all three
  states (foreground/background taps via a response listener, cold start via
  `useLastNotificationResponse`).
- Backend: `POST/DELETE /notifications/…token` store Expo tokens in Redis
  (`push:tokens:<user_id>`); `app/services/push.py` sends via the Expo push API
  and prunes `DeviceNotRegistered` tokens. Pushes fire on the ride events the
  rider cares about (accepted / arrived / completed / cancelled / no-driver) —
  best-effort, never blocking a ride transition.

**Device-only:** real push delivery needs a physical device and an EAS
`projectId`; it can't be exercised on a simulator. Token registration + storage
is verified; delivery is wired but untested here.

## Polish pass (Stage 9)

- `lib/strings.ts` — **all** user-facing Uzbek text centralized (functions where
  values interpolate), ready for review/translation. Every screen now reads from
  it.
- `components/OfflineBanner.tsx` — app-wide persistent banner (expo-network),
  mounted at the root; shown whenever the device is offline.
- `components/ui/Skeleton.tsx` — animated skeletons; used for the history list
  loading state.
- Empty/loading/error states across screens; money (`24 000 so'm`), phone
  (`+998 XX XXX XX XX`) and dates formatted consistently via `lib/format.ts`.

## Status: passenger app complete (Stages 1–9)

Full flow: login → home/map → pick addresses → estimate → request → search (WS)
→ active ride (live driver) → rate, plus profile, history, push notifications,
offline handling, and centralized Uzbek strings.

## Driver app — onboarding (Stage 1)

Same codebase, under `(driver)/`, reusing the API client, auth store, strings,
and (later) Map + WS layers.

- `(driver)/index.tsx` — **gate** that routes by onboarding state: no profile →
  registration; `status ≠ approved` → document upload + pending (polls every
  5s); `approved` → driver home. (Two `index.tsx` under `(passenger)`/`(driver)`
  coexist because `Stack.Protected` makes them mutually exclusive by role.)
- `components/driver/RegisterForm.tsx` — car model / number (`01 A 123 BA`) /
  color / year → `POST /driver/register`.
- `components/driver/Onboarding.tsx` — the four documents (passport, license,
  tech passport, inspection) via **expo-image-picker** (camera or library),
  uploaded with progress; per-document status badges; rejected docs show the
  reason and allow re-upload; a pending banner while awaiting approval.
- Backend: added `POST /driver/documents/upload` (multipart → saved under
  `uploads/<driver_id>/`, served statically at `/uploads`).

## Driver app — home + online/offline + GPS (Stage 2)

- `components/driver/DriverHome.tsx` — full-screen map, a top card with online
  status + today's completed rides + today's earnings, and a big online/offline
  toggle. Going online requires location permission.
- `lib/ws/useLocationStreaming.ts` — while online, opens the existing
  `/ws/driver/location` socket and streams GPS (~every 5s via
  `expo-location.watchPositionAsync`) to the backend (Redis GEO). Tears down on
  offline/unmount; reconnects with a short delay. Foreground-only (background is
  Stage 5).
- Backend: added `GET /driver/stats/today` (completed rides + net earnings since
  midnight).

## Driver app — incoming ride offer (Stage 3)

- `useLocationStreaming` also listens for `ride_offer` events on the driver
  socket and surfaces the current offer (one at a time; others ignored while one
  is open).
- `components/driver/RideOfferModal.tsx` — full-screen modal with pickup →
  destination, distance, fare, passenger rating; a **30-second countdown** (ring
  + progress bar); **vibration + haptics** on arrival; Accept → `POST
  /rides/{id}/accept` → pickup screen; Reject / timeout → `POST
  /rides/{id}/reject` and dismiss.
- Backend: added `GET /rides/{id}/offer` — the details a driver needs to decide,
  authorized only for the driver currently being offered the ride (includes the
  passenger's average rating).

## Driver app — pickup + trip (Stage 4)

- `(driver)/pickup/[rideId].tsx` — route from the driver to the pickup point;
  passenger card (name, ★rating, call button); **Navigatsiya** (opens Apple/
  Google Maps); "Yetib keldim" → `arrived`, then "Sayohatni boshlash" → `start`
  → trip screen.
- `(driver)/trip/[rideId].tsx` — route pickup → destination, destination + fare;
  "Sayohatni tugatish" → completes the ride (`POST /payments/rides/{id}/complete`
  → DB trigger settles commission/wallet) → summary. GPS keeps streaming (the
  DriverHome stays mounted underneath).
- Backend: added `GET /rides/{id}/driver-view` — extracts pickup/dropoff lat/lng
  from PostGIS and includes passenger name/phone/rating for the assigned driver.
- `lib/nav.ts` — external-nav + tel helpers.

Each status change (`arrived`/`ongoing`/`completed`) already pushes to the
passenger's active-ride screen.

## Driver app — background mode (Stage 5)

- `lib/backgroundLocation.ts` — a TaskManager task streams GPS to `POST
  /driver/location` (HTTP, not WS) in foreground **and** background. Android runs
  a foreground service with a persistent "Siz onlaynsiz" notification; iOS uses
  `UIBackgroundModes: location`. Battery: `pausesUpdatesAutomatically` +
  automotive activity type. Started/stopped with the online toggle.
- Architecture shift: the driver socket (`useDriverSocket`) now handles **offers
  only** — location moved to the background task so it survives backgrounding.
- Offer wakeup: the dispatcher sends a **high-priority push** to the offered
  driver; on resume the app calls `GET /driver/pending-offer` and re-opens the
  offer modal for any offer it missed while backgrounded.
- Backend: `POST /driver/location` (HTTP GEOADD + relay), `GET
  /driver/pending-offer`, and an offer push from the dispatcher.

**Requires a rebuild** (native background config) and a **real device** — the
plan notes background location and push wakeup are unreliable in simulators.

## Driver app — earnings, wallet, history (Stage 6)

- `(driver)/summary/[rideId].tsx` — after completing: fare, commission (%), net
  earning, then **rate the passenger** (5★ + comment) → `POST /rides/{id}/rate`.
- `(driver)/earnings.tsx` — today / this week / this month totals + a dependency-
  free daily **bar chart** (`components/driver/BarChart.tsx`).
- `(driver)/wallet.tsx` — balance (red when negative), **commission owed** on
  cash rides, and the `wallet_transactions` list with running balance.
- `(driver)/history/` — completed/cancelled rides with per-ride net earning;
  tap → breakdown detail.
- Home gains an Earnings / Hamyon / Tarix menu.
- Backend: `GET /driver/earnings`, `/driver/wallet`, `/driver/wallet/
  transactions`, `/driver/rides`, `/driver/rides/{id}/earning` (all read
  existing `driver_commissions` / `wallets` / `wallet_transactions`).

## Driver app — bonuses & final polish (Stage 7)

- `components/driver/BonusCard.tsx` + a **Bonuses** section on the earnings
  screen: active driver campaigns with a progress bar ("10 tadan 7 tasi
  bajarildi"), reward amount, and a completed state.
- Backend: `GET /driver/bonuses` — active `driver`/`both` campaigns joined with
  the driver's `bonus_achievements` progress.
- Push (offer wakeup, plus the passenger notification stack) and the app-wide
  offline banner already cover both apps; loading/empty/error states are present
  across the driver screens; all text is in `lib/strings.ts`.

## Status: complete

Backend + admin panel + passenger app (Stages 1–9) + driver app (Stages 1–7)
are all built. The full loop is verified end-to-end against the live backend:
passenger requests → dispatcher offers → driver accepts → pickup → trip →
complete → commission/wallet settle → both rate. Remaining productionization:
real SMS (OTP), payment gateways (Payme/Click), a Google Maps key, and device
testing of background mode.
