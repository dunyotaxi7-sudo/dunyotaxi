// Provider-agnostic map contract. NOTHING outside components/Map may import
// react-native-maps (or, later, Yandex) — screens depend only on these types.

/** A WGS84 coordinate. We use lat/lng everywhere (not the provider's shapes). */
export interface Coords {
  lat: number;
  lng: number;
}

export type MarkerKind = "user" | "driver" | "pickup" | "dropoff";

export interface MapMarker {
  id: string;
  coordinate: Coords;
  title?: string;
  description?: string;
  kind?: MarkerKind;
  /** Heading in degrees (for rotating car markers), optional. */
  heading?: number;
}

/** Camera target expressed provider-agnostically (center + zoom level). */
export interface MapCamera {
  center: Coords;
  /** Google-style zoom (higher = closer). Defaults to a city view. */
  zoom?: number;
}

export interface MapProps {
  markers?: MapMarker[];
  /** Polyline drawn through these points (e.g. a route). */
  route?: Coords[];
  initialCamera?: MapCamera;
  showUserLocation?: boolean;
  /** Keeps the camera centered on the user's location. */
  followsUser?: boolean;
  /** Draw the Bukhara service-area outline. */
  showServiceArea?: boolean;
  onRegionChange?: (center: Coords) => void;
  onPress?: (coords: Coords) => void;
  style?: object;
}

// Bukhara region centre.
export const BUKHARA_CENTER: Coords = { lat: 39.767, lng: 64.421 };
export const DEFAULT_ZOOM = 13;
