// Provider-agnostic map contract. The rest of the app depends ONLY on these
// types — never on Google Maps (or, later, Yandex Maps) directly.

export interface MapPoint {
  lat: number;
  lng: number;
}

export interface MapMarker {
  id: string;
  position: MapPoint;
  title?: string;
  subtitle?: string;
  status?: string;
}

export interface LiveMapProps {
  center: MapPoint;
  zoom?: number;
  markers: MapMarker[];
  /** Optional polygons (rings of points) to outline, e.g. the service area. */
  polygons?: MapPoint[][];
  route?: MapPoint[];
  onMarkerClick?: (id: string) => void;
  className?: string;
}

// Bukhara region centre (WGS84).
export const BUKHARA_CENTER: MapPoint = { lat: 39.767, lng: 64.421 };
