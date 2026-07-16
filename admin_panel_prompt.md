# Bukhara Taxi — Admin Panel (Next.js)

Build a web admin panel for the Bukhara Taxi service. The FastAPI backend already 
exists and is tested — this panel consumes its REST + WebSocket endpoints. Single 
admin user (no multi-role admin system needed yet).

## Tech Stack
- Next.js 14+ (App Router) with TypeScript
- Tailwind CSS for styling
- TanStack Query (React Query) for data fetching + caching
- Axios for API client with JWT interceptor
- Recharts for statistics charts
- Google Maps via @react-google-maps/api for the live map
  IMPORTANT: isolate ALL map logic in a single component (components/LiveMap). 
  We will swap Google Maps for Yandex Maps later, so keep the map provider behind 
  a clean interface — the rest of the app should not import Google Maps directly.
- Zustand or React Context for auth state

## Auth
The backend uses phone + SMS OTP login (same as the mobile apps). For admin:
- Login page: enter phone → request OTP → enter code → receive JWT.
- Store JWT securely, attach as Bearer token on every request via Axios interceptor.
- Redirect to /login on 401. Protect all routes behind an auth guard.
- Only users with role='admin' can access; show an error otherwise.

## Layout
- Persistent sidebar navigation + top bar (admin name, logout).
- Responsive but desktop-first (admins use laptops).
- Clean, minimal, data-dense tables. Use sentence case, no ALL CAPS.

## Pages (build in this order)

### 1. Dashboard (/)
Overview cards + a small activity chart:
- Total rides today / this week / this month
- Active (online) drivers count — live from backend
- Revenue today (sum of completed ride prices)
- Total commission collected
- A line chart of rides per day (last 30 days) via Recharts.

### 2. Drivers (/drivers)
- Table: name, phone, car, rating, status, total rides, online/offline.
- Filter by status (pending / approved / rejected / suspended).
- Click a driver → detail page (/drivers/[id]) showing:
  - Profile + car info
  - Uploaded documents (passport, license, tech passport, inspection) with 
    approve / reject buttons (reject requires a reason).
  - Ride history for this driver
  - Wallet balance + transaction history
  - Block / suspend / reactivate actions
- Every mutating action must hit the backend and refetch.

### 3. Passengers (/passengers)
- Table: name, phone, total rides, join date.
- Click → detail: ride history, ratings given.

### 4. Live map (/map)
- Google Maps centered on Bukhara region.
- Show all online drivers as markers, positions from the backend 
  (GET admin live-drivers, which reads Redis). Refresh every 5–10s (or WebSocket 
  if the backend exposes one).
- Click a marker → small popup with driver name, car, current ride status.
- Optionally show active rides as lines from pickup to destination.
- REMEMBER: keep all Google-specific code inside components/LiveMap only.

### 5. Rides (/rides)
- Table: id, passenger, driver, from → to, distance, price, status, date.
- Filter by status and date range.
- Click → detail: full ride info, map of the route, payment, ratings, 
  commission breakdown.

### 6. Pricing (/pricing)
- Form to edit pricing_config: base_fare, base_km, price_per_km, min_price, 
  night_multiplier, night_start, night_end.
- Show a live preview: "5 km day = 17,500 so'm, 5 km night = 21,000 so'm" 
  that recalculates as the admin edits values.
- Save → PATCH backend, show confirmation.

### 7. Commission (/commission)
- Edit the global commission percentage.
- Add per-driver commission overrides (select driver, set %, valid dates).
- Table of existing overrides with edit/delete.

### 8. Bonus & Promo (/bonus)
- Two tabs: Bonus campaigns and Promo codes.
- Bonus: create/edit campaigns (name, type, target, amount, active dates).
- Promo: create/edit codes (code, discount type, value, usage limits, dates).
- Tables listing existing ones with active/inactive toggle.

### 9. Statistics (/stats)
- Revenue over time (line chart)
- Rides by status (pie/bar)
- Top drivers by rides/earnings (table)
- Peak hours heatmap or bar chart
- Date range selector.

### 10. Audit log (/audit)
- Table of admin actions from admin_audit_logs: admin, action, entity, 
  old→new value, timestamp.
- Filter by action type and date.

## Money & Formatting
- All amounts are integers in so'm. Format with thousands separators: "24 000 so'm".
- Dates in a readable local format.
- Phone format: +998 XX XXX XX XX.

## Important
- Create a typed API client layer (lib/api) with functions per endpoint — 
  don't scatter fetch calls in components.
- Use React Query for all server state; show loading and error states.
- Handle empty states gracefully (no drivers yet, no rides, etc.).
- Log out clears the token and redirects to login.

Start by scaffolding the Next.js project, setting up Tailwind, the API client with 
the JWT interceptor, the auth flow (login + guard), and the sidebar layout. Then 
build the Dashboard. After that we'll do the pages one by one.
