// Client-side service-area pre-check (UX only — the backend is authoritative).
// Bundles the simplified Bukhara-region polygon and does a local point-in-polygon
// test so the app can give instant feedback before calling the backend.
import region from "./bukhara-region.json";
import type { Coords } from "./types";

type Ring = number[][]; // [lng, lat] pairs
type Geometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] };

const GEOM = (region as { geometry: Geometry }).geometry;

// Each element is one polygon's rings (outer + holes).
const POLYGONS: Ring[][] =
  GEOM.type === "Polygon" ? [GEOM.coordinates] : GEOM.coordinates;

// Outer rings as Coords, for drawing the outline on the map.
export const SERVICE_AREA_RINGS: Coords[][] = POLYGONS.map((poly) =>
  poly[0].map(([lng, lat]) => ({ lat, lng })),
);

/** Ray-casting point-in-ring test. `ring` is [lng, lat] pairs. */
function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** True if the point is inside any polygon's outer ring but not in a hole. */
export function isWithinServiceArea(c: Coords): boolean {
  for (const poly of POLYGONS) {
    if (poly.length === 0) continue;
    if (!inRing(c.lng, c.lat, poly[0])) continue; // not in outer ring
    let inHole = false;
    for (let h = 1; h < poly.length; h++) {
      if (inRing(c.lng, c.lat, poly[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}
