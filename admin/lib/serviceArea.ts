// Bundled simplified Bukhara-region polygon for drawing the service-area
// outline on admin maps.
import region from "./bukhara-region.json";
import type { MapPoint } from "@/components/LiveMap";

type Ring = number[][];
type Geometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] };

const GEOM = (region as { geometry: Geometry }).geometry;
const POLYGONS: Ring[][] =
  GEOM.type === "Polygon" ? [GEOM.coordinates] : GEOM.coordinates;

// Outer ring of each polygon as MapPoint[], for drawing.
export const SERVICE_AREA_POLYGONS: MapPoint[][] = POLYGONS.map((poly) =>
  poly[0].map(([lng, lat]) => ({ lat, lng })),
);

/** Convert any GeoJSON (Feature / geometry, Polygon / MultiPolygon) into outer
 *  rings of MapPoints for drawing. Returns [] if it can't be parsed. */
export function geojsonToPolygons(geojson: unknown): MapPoint[][] {
  const g = geojson as { type?: string; geometry?: Geometry; coordinates?: unknown };
  const geom = (g?.type === "Feature" ? g.geometry : g) as Geometry | undefined;
  if (!geom?.type) return [];
  const polys: Ring[][] =
    geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  return polys.map((poly) => poly[0].map(([lng, lat]) => ({ lat, lng })));
}
