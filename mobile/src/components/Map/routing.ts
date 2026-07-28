// Driving-route lookup via OSRM (open-source, free). Returns the road-following
// geometry to draw plus the real distance/time, so the app can show the true
// route and price on the actual road distance instead of a straight-line guess.
//
// Uses the public demo server, which is fine for pilot traffic. For production
// scale, self-host OSRM and point OSRM_BASE at it (same API).
import type { Coords } from "./types";

const OSRM_BASE =
  process.env.EXPO_PUBLIC_OSRM_URL || "https://router.project-osrm.org";

export interface RouteResult {
  /** Road-following polyline points, pickup → dropoff. */
  points: Coords[];
  distanceKm: number;
  durationMin: number;
}

/** Real driving route between two points, or null on any failure (caller then
 *  falls back to a straight line + server-estimated distance). */
export async function getRoute(from: Coords, to: Coords): Promise<RouteResult | null> {
  try {
    const url =
      `${OSRM_BASE}/route/v1/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    const coords: [number, number][] = route?.geometry?.coordinates ?? [];
    if (!route || coords.length < 2) return null;
    return {
      points: coords.map(([lng, lat]) => ({ lat, lng })),
      distanceKm: route.distance / 1000,
      durationMin: Math.max(1, Math.round(route.duration / 60)),
    };
  } catch {
    return null;
  }
}
