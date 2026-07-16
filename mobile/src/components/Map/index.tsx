// ─────────────────────────────────────────────────────────────────────────
//  THE ONLY FILE ALLOWED TO IMPORT react-native-maps.
//  Everything else uses the provider-agnostic <Map /> + types below. To swap
//  Google Maps for Yandex later, replace this folder's implementation only.
// ─────────────────────────────────────────────────────────────────────────
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, {
  Marker,
  Polygon,
  Polyline,
  PROVIDER_GOOGLE,
  type LatLng,
  type Region,
} from "react-native-maps";
import { SERVICE_AREA_RINGS } from "./serviceArea";
import {
  BUKHARA_CENTER,
  DEFAULT_ZOOM,
  type Coords,
  type MapMarker,
  type MapProps,
  type MarkerKind,
} from "./types";

export type { Coords, MapMarker, MapProps, MapCamera, MarkerKind } from "./types";
export { BUKHARA_CENTER, DEFAULT_ZOOM } from "./types";
export { useCurrentLocation } from "./useCurrentLocation";
export type { CurrentLocation, PermissionState } from "./useCurrentLocation";
export {
  reverseGeocode,
  searchAddress,
  suggestPlaces,
  placeCoords,
} from "./geocode";
export type { PlaceSuggestion } from "./geocode";
export { isWithinServiceArea, SERVICE_AREA_RINGS } from "./serviceArea";

/** Imperative handle so callers can move the camera without touching the provider. */
export interface MapHandle {
  animateTo: (center: Coords, zoom?: number) => void;
  /** Frame a set of points (e.g. pickup + dropoff) with padding. */
  fit: (points: Coords[]) => void;
}

const toLatLng = (c: Coords): LatLng => ({
  latitude: c.lat,
  longitude: c.lng,
});

// Google-style zoom → region deltas. delta ≈ 360 / 2^zoom.
function zoomToDelta(zoom: number): number {
  return 360 / Math.pow(2, zoom);
}

function cameraToRegion(center: Coords, zoom = DEFAULT_ZOOM): Region {
  const delta = zoomToDelta(zoom);
  return {
    latitude: center.lat,
    longitude: center.lng,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

const PIN_COLOR: Record<MarkerKind, string> = {
  user: "#2563eb",
  driver: "#16a34a",
  pickup: "#2563eb",
  dropoff: "#dc2626",
};

// Use Google provider on Android; on iOS default to Apple Maps unless a Google
// key is configured (keeps it working in dev without an iOS Google key).
const provider = Platform.OS === "android" ? PROVIDER_GOOGLE : undefined;

// Android's Google MapView hard-crashes without an API key in the manifest.
// iOS uses Apple Maps (no key). So only render the native map when it's safe:
// iOS always, Android only when a key is configured.
const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const CAN_USE_NATIVE_MAP = Platform.OS === "ios" || GOOGLE_KEY.length > 0;

export const Map = forwardRef<MapHandle, MapProps>(function Map(
  {
    markers = [],
    route,
    initialCamera,
    showUserLocation = true,
    followsUser = false,
    showServiceArea = false,
    onRegionChange,
    onPress,
    style,
  },
  ref,
) {
  const mapRef = useRef<MapView>(null);

  useImperativeHandle(ref, () => ({
    animateTo: (center, zoom) => {
      mapRef.current?.animateToRegion(cameraToRegion(center, zoom), 400);
    },
    fit: (points) => {
      if (points.length === 0) return;
      mapRef.current?.fitToCoordinates(points.map(toLatLng), {
        edgePadding: { top: 80, right: 60, bottom: 80, left: 60 },
        animated: true,
      });
    },
  }));

  const initialRegion = useMemo(
    () =>
      cameraToRegion(
        initialCamera?.center ?? BUKHARA_CENTER,
        initialCamera?.zoom,
      ),
    [initialCamera],
  );

  const routeCoords = useMemo(() => route?.map(toLatLng), [route]);

  // No native map available (Android without a Maps key) → safe placeholder.
  if (!CAN_USE_NATIVE_MAP) {
    return <MapPlaceholder markers={markers} style={style} />;
  }

  return (
    <MapView
      ref={mapRef}
      provider={provider}
      style={[styles.map, style]}
      initialRegion={initialRegion}
      showsUserLocation={showUserLocation}
      followsUserLocation={followsUser}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      onRegionChangeComplete={(r) =>
        onRegionChange?.({ lat: r.latitude, lng: r.longitude })
      }
      onPress={(e) =>
        onPress?.({
          lat: e.nativeEvent.coordinate.latitude,
          lng: e.nativeEvent.coordinate.longitude,
        })
      }
    >
      {markers.map((m) => (
        <Marker
          key={m.id}
          coordinate={toLatLng(m.coordinate)}
          title={m.title}
          description={m.description}
          pinColor={PIN_COLOR[m.kind ?? "pickup"]}
          rotation={m.heading ?? 0}
          flat={m.kind === "driver"}
          anchor={{ x: 0.5, y: 0.5 }}
        />
      ))}

      {routeCoords && routeCoords.length >= 2 && (
        <Polyline
          coordinates={routeCoords}
          strokeWidth={4}
          strokeColor="#2563eb"
        />
      )}

      {showServiceArea &&
        SERVICE_AREA_RINGS.map((ring, i) => (
          <Polygon
            key={`area-${i}`}
            coordinates={ring.map(toLatLng)}
            strokeColor="rgba(37,99,235,0.6)"
            strokeWidth={1.5}
            fillColor="rgba(37,99,235,0.05)"
          />
        ))}
    </MapView>
  );
});

/** Shown when the native map can't run (Android without a Maps API key).
 *  Keeps the ride flow fully usable; only the map tiles are missing. */
function MapPlaceholder({
  markers,
  style,
}: {
  markers: MapMarker[];
  style?: object;
}) {
  return (
    <View style={[styles.placeholder, style]}>
      <Text style={styles.placeholderIcon}>🗺️</Text>
      <Text style={styles.placeholderText}>Xarita mavjud emas</Text>
      <Text style={styles.placeholderSub}>
        Google Maps API kaliti sozlanmagan
        {markers.length ? ` · ${markers.length} nuqta` : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef1f5",
    padding: 24,
    gap: 6,
  },
  placeholderIcon: { fontSize: 40 },
  placeholderText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  placeholderSub: { fontSize: 12, color: "#6b7280", textAlign: "center" },
});
