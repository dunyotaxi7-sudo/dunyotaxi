"use client";

// The ONLY file allowed to import Google Maps. Swap this implementation for a
// Yandex one later without touching the rest of the app — just point
// components/LiveMap/index.tsx at the new provider.

import {
  GoogleMap,
  InfoWindowF,
  MarkerF,
  PolygonF,
  PolylineF,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useState } from "react";
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_ID,
  GOOGLE_MAPS_LIBRARIES,
  MAPS_LANGUAGE,
} from "@/lib/maps";
import type { LiveMapProps } from "./types";

const containerStyle = { width: "100%", height: "100%" };

export function GoogleLiveMap({
  center,
  zoom = 13,
  markers,
  polygons,
  route,
  onMarkerClick,
}: LiveMapProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_ID,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    language: MAPS_LANGUAGE,
    region: "UZ",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  const [selected, setSelected] = useState<string | null>(null);

  if (loadError) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-red-600">
        Google xaritasini yuklab bo'lmadi.
      </div>
    );
  }
  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted">
        Xarita yuklanmoqda…
      </div>
    );
  }

  const active = markers.find((m) => m.id === selected);

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={zoom}
      options={{ streetViewControl: false, mapTypeControl: false }}
    >
      {polygons?.map((ring, i) => (
        <PolygonF
          key={`poly-${i}`}
          paths={ring}
          options={{
            strokeColor: "#2563eb",
            strokeOpacity: 0.7,
            strokeWeight: 1.5,
            fillColor: "#2563eb",
            fillOpacity: 0.05,
            clickable: false,
          }}
        />
      ))}

      {route && route.length >= 2 && (
        <PolylineF
          path={route}
          options={{ strokeColor: "#2563eb", strokeWeight: 4 }}
        />
      )}

      {markers.map((m) => (
        <MarkerF
          key={m.id}
          position={m.position}
          title={m.title}
          onClick={() => {
            setSelected(m.id);
            onMarkerClick?.(m.id);
          }}
        />
      ))}

      {active && (
        <InfoWindowF
          position={active.position}
          onCloseClick={() => setSelected(null)}
        >
          <div className="text-sm">
            <div className="font-medium">{active.title ?? "Haydovchi"}</div>
            {active.subtitle && (
              <div className="text-gray-600">{active.subtitle}</div>
            )}
            {active.status && (
              <div className="text-gray-500 text-xs mt-1">{active.status}</div>
            )}
          </div>
        </InfoWindowF>
      )}
    </GoogleMap>
  );
}
