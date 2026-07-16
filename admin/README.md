# Bukhara Taxi — Admin Panel

Web admin panel (Next.js) for the Bukhara Taxi backend. Consumes the FastAPI
REST + WebSocket API at the repo root.

## Stack
- Next.js 16 (App Router) + TypeScript · Turbopack
- Tailwind CSS v4 (CSS-based config in `app/globals.css`)
- TanStack Query for server state
- Axios client with a JWT interceptor (`lib/axios.ts`)
- Recharts for charts
- Zustand for auth state (`lib/auth-store.ts`)
- `@react-google-maps/api` for the live map — **isolated** in `components/LiveMap/`

> Stack note: the prompt asked for Next 14 / Google Maps; `create-next-app`
> installed Next 16 + React 19 + Tailwind 4 (all App-Router compatible). Next 16
> makes `params`/`searchParams` async in server components, so pages are built
> as **client components** using `useParams`/`useRouter` hooks.

## Setup

The backend must be running first (see repo root README — it runs on
`http://127.0.0.1:8000`).

```bash
cd admin
npm install
cp .env.example .env.local     # already created; set the Google Maps key if you have one
npm run dev                    # http://localhost:3000
```

Log in with the admin phone created via the backend's `create_admin` script
(`+998901234567`). The OTP dev code is returned in the response and shown on the
verify screen (`OTP_DEBUG_RETURN=true` in the backend `.env`).

### Environment (`.env.local`)
- `NEXT_PUBLIC_API_URL` — backend base URL (default `http://127.0.0.1:8000`)
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — optional. Without it the `/map` page shows
  a provider-neutral list fallback (positions still live from the backend).

## Architecture

```
app/
  login/                 phone → OTP → verify (admin role enforced)
  (panel)/               auth-guarded shell (sidebar + topbar)
    page.tsx             Dashboard — stat cards + rides/day line chart
    drivers/             list (live) + [id] detail (documents live; rest stubbed)
    map/                 live driver map (via components/LiveMap)
    audit/               admin audit log (live)
    passengers|rides|pricing|commission|bonus|stats   navigable stubs (next phase)
components/
  LiveMap/               map provider abstraction — see below
  Sidebar, Topbar, ui, PageStub
lib/
  api.ts                 typed client, one fn per endpoint (no fetch in components)
  axios.ts               instance + JWT interceptor + 401 → /login
  auth-store.ts          Zustand session store (localStorage-backed)
  types.ts               types mirroring backend schemas
  format.ts              so'm / phone / date formatters
```

### Map provider isolation
Per the spec, **all** Google-Maps code lives behind `components/LiveMap/`:
- `types.ts` — provider-agnostic `MapMarker` / `LiveMapProps` contract
- `GoogleLiveMap.tsx` — the only file importing `@react-google-maps/api`
- `index.tsx` — public `LiveMap` entry; picks the provider + list fallback

To switch to Yandex Maps later, add `YandexLiveMap.tsx` and point `index.tsx`
at it. Nothing else in the app changes.

## Status

Foundation phase per the prompt is complete: scaffold, Tailwind, typed API
client + JWT interceptor, auth (login + guard + 401 redirect), sidebar layout,
and the Dashboard. Live pages: Dashboard, Drivers list, Live map, Audit log.
The remaining pages (passengers, rides, pricing, commission, bonus, statistics,
driver-detail actions) are wired as routes with stubs and are the next phase —
some need small backend list endpoints (`/admin/rides`, `/admin/passengers`).

`npm run build` passes (TypeScript + lint).
