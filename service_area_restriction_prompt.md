# Bukhara Taxi — Restrict service area to Bukhara region only

Add a hard geographic restriction: the service must only operate INSIDE Bukhara 
region (Buxoro viloyati). Both the pickup and the destination of every ride must 
fall within the region's boundary. Any ride where either point is outside is 
rejected.

Bukhara region has a complex shape (mostly Kyzylkum desert), so a simple bounding 
box is NOT acceptable — it would wrongly include neighboring regions. Use the 
actual region polygon.

## Step 1 — Get the boundary polygon
Obtain the official administrative boundary of Bukhara region as a GeoJSON polygon 
(admin level 4 / province). Good free sources: OpenStreetMap (via Overpass or 
Nominatim relation for "Buxoro viloyati"), geoBoundaries, or GADM (Uzbekistan 
ADM1). Save it in the repo as data/bukhara_region.geojson. If the polygon is very 
high-resolution, keep a simplified version too (e.g. via mapshaper) for fast 
client-side checks, but keep the precise one for the backend.

## Step 2 — Store it in the database (PostGIS)
- Add a table `service_areas` (or a single-row config) holding the region name and 
  its boundary as GEOGRAPHY(POLYGON, 4326) / GEOGRAPHY(MULTIPOLYGON, 4326).
- Load bukhara_region.geojson into it via a migration or seed script.
- Add a GIST index on the geometry.
- Create a helper SQL function or query using ST_Contains / ST_Covers to test 
  whether a given point is inside the service area, e.g.:
    SELECT ST_Covers(area_geom, ST_MakePoint(:lng, :lat)::geography) FROM service_areas;

## Step 3 — Enforce in the backend (the real guard)
This is the authoritative check — it can't be bypassed by a modified app.
- In POST /rides/estimate and POST /rides/request, validate BOTH from_location 
  and to_location are inside the service area before doing anything else.
- If either point is outside, return HTTP 400 with a clear error code/message, 
  e.g. { "error": "outside_service_area", "message": "Xizmat faqat Buxoro 
  viloyati ichida ishlaydi." } and indicate which point failed (pickup vs 
  destination) so the app can show a precise message.
- Add a lightweight reusable service, e.g. is_within_service_area(lat, lng) -> bool, 
  used by both endpoints. Cache the polygon in memory on startup so every request 
  doesn't hit the DB (reload if the area changes).
- Also apply the same check anywhere a location enters the system (e.g. saved 
  addresses / favorites), not just ride creation.

## Step 4 — Client-side pre-check (UX, not security)
In the passenger app:
- Bundle the simplified GeoJSON polygon and check selected pickup/destination 
  points locally as the user picks them (point-in-polygon).
- If a point is outside, immediately show an inline message ("Bu manzil Buxoro 
  viloyatidan tashqarida") and disable the "Narxni ko'rish" button.
- Constrain the map: default and recenter on Bukhara region; optionally draw the 
  region outline on the map so users see the covered area.
- This is only for fast feedback — never rely on it for enforcement; the backend 
  check is the source of truth.

Do the same restriction awareness in the driver app if a driver could somehow set 
a location outside (defensive, but the backend guard covers it regardless).

## Step 5 — Admin panel
- On the live map and pricing/config area, show the Bukhara region outline.
- Optional: let the admin update the service-area polygon later (upload a new 
  GeoJSON) without a code change, since it's stored in the DB. Log this in 
  admin_audit_logs.

## Step 6 — Tests
- Point clearly inside (e.g. Bukhara city center ~39.767, 64.421) → allowed.
- Point in a neighboring region (e.g. Navoiy or Qashqadaryo) that WOULD fall in a 
  naive bounding box → correctly rejected.
- Ride with valid pickup but out-of-area destination → rejected, error names the 
  destination.
- Ride with both points outside → rejected.
- Verify the DB ST_Covers result matches the in-app point-in-polygon result for a 
  set of sample points.

Important: all distances/pricing stay unchanged; this only adds an allow/deny gate 
on locations. Keep the polygon logic in one well-tested place so it's easy to 
adjust the covered area later.
