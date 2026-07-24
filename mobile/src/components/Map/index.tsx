// ─────────────────────────────────────────────────────────────────────────
//  THE ONLY FILE ALLOWED TO IMPORT the map SDK (now Yandex MapKit).
//  Everything else uses the provider-agnostic <Map /> + types below, so the
//  provider lives entirely in this folder.
// ─────────────────────────────────────────────────────────────────────────
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import Yamap, {
  Animation,
  Marker,
  Polygon,
  Polyline,
  type Point,
  type YamapRef,
  YamapInstance,
} from "react-native-yamap-plus";
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

// Our Coords are {lat, lng}; Yandex speaks {lat, lon}.
const toPoint = (c: Coords): Point => ({ lat: c.lat, lon: c.lng });

const PIN_COLOR: Record<MarkerKind, string> = {
  user: "#2563eb",
  driver: "#16a34a",
  pickup: "#2563eb",
  dropoff: "#dc2626",
};

// MapKit needs its key before the first map renders, so init once at import
// time. The map labels have no Uzbek locale (same as the Geocoder), so pin the
// map language to Russian for consistency with addresses.
const MAPKIT_KEY = process.env.EXPO_PUBLIC_YANDEX_MAPKIT_KEY ?? "";
if (MAPKIT_KEY) {
  void YamapInstance.init(MAPKIT_KEY);
  void YamapInstance.setLocale("ru_RU");
}

const ANIM_MS = 0.4; // Yandex durations are in seconds

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
  const mapRef = useRef<YamapRef>(null);

  useImperativeHandle(ref, () => ({
    animateTo: (center, zoom = DEFAULT_ZOOM) => {
      mapRef.current?.setCenter(toPoint(center), zoom, 0, 0, ANIM_MS, Animation.SMOOTH);
    },
    fit: (points) => {
      if (points.length === 0) return;
      mapRef.current?.fitMarkers(points.map(toPoint), ANIM_MS, Animation.SMOOTH);
    },
  }));

  const initialRegion = useMemo(() => {
    const c = initialCamera?.center ?? BUKHARA_CENTER;
    return { lat: c.lat, lon: c.lng, zoom: initialCamera?.zoom ?? DEFAULT_ZOOM };
  }, [initialCamera]);

  const routePoints = useMemo(() => route?.map(toPoint), [route]);

  // No MapKit key configured → safe placeholder; the ride flow stays usable.
  if (!MAPKIT_KEY) {
    return <MapPlaceholder markers={markers} style={style} />;
  }

  return (
    <Yamap
      ref={mapRef}
      style={[styles.map, style]}
      initialRegion={initialRegion}
      showUserPosition={showUserLocation}
      followUser={followsUser}
      nightMode={false}
      mapType="vector"
      onCameraPositionChangeEnd={(e) =>
        onRegionChange?.({
          lat: e.nativeEvent.point.lat,
          lng: e.nativeEvent.point.lon,
        })
      }
      onMapPress={(e) =>
        onPress?.({ lat: e.nativeEvent.lat, lng: e.nativeEvent.lon })
      }
    >
      {markers.map((m) => (
        <Marker
          key={m.id}
          point={toPoint(m.coordinate)}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View
            style={[
              styles.pin,
              { backgroundColor: PIN_COLOR[m.kind ?? "pickup"] },
            ]}
          />
        </Marker>
      ))}

      {routePoints && routePoints.length >= 2 && (
        <Polyline points={routePoints} strokeColor="#2563eb" strokeWidth={4} />
      )}

      {showServiceArea &&
        SERVICE_AREA_RINGS.map((ring, i) => (
          <Polygon
            key={`area-${i}`}
            points={ring.map(toPoint)}
            strokeColor="rgba(37,99,235,0.6)"
            strokeWidth={1.5}
            fillColor="rgba(37,99,235,0.05)"
          />
        ))}
    </Yamap>
  );
});

/** Shown when MapKit has no key. Keeps the ride flow fully usable; only the
 *  map tiles are missing. */
function MapPlaceholder({
  markers,
  style,
}: {
  markers: MapMarker[];
  style?: object;
}) {
  return (
    <View style={[styles.placeholder, style]}>
      <Text style={styles.placeholderText}>Xarita mavjud emas</Text>
      <Text style={styles.placeholderSub}>
        Yandex MapKit kaliti sozlanmagan
        {markers.length ? ` · ${markers.length} nuqta` : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  // A simple colored dot with a white ring — snapshotted by the native Marker.
  pin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: "#ffffff",
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef1f5",
    padding: 24,
    gap: 6,
  },
  placeholderText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  placeholderSub: { fontSize: 12, color: "#6b7280", textAlign: "center" },
});
