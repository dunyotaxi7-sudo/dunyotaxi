"use client";

// Public entry point for the map. The app imports `LiveMap` from here and
// passes provider-agnostic markers. Which underlying provider renders is an
// implementation detail decided in this file only.

import dynamic from "next/dynamic";
import type { LiveMapProps, MapMarker, MapPoint } from "./types";
import { BUKHARA_CENTER } from "./types";

export type { LiveMapProps, MapMarker, MapPoint };
export { BUKHARA_CENTER };

// Load the Google implementation client-side only (it touches `window`).
const GoogleLiveMap = dynamic(
  () => import("./GoogleLiveMap").then((m) => m.GoogleLiveMap),
  { ssr: false },
);

/**
 * Renders the live map. When no Google Maps key is configured we degrade to a
 * simple list of markers so the page still works in development — this
 * fallback is intentionally provider-neutral too.
 */
export function LiveMap(props: LiveMapProps) {
  const hasKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

  if (!hasKey) {
    return <MapFallback {...props} />;
  }
  return <GoogleLiveMap {...props} />;
}

function MapFallback({ markers, onMarkerClick }: LiveMapProps) {
  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
        Google xaritasi kaliti sozlanmagan (<code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>).
        Ro'yxat ko'rinishi ko'rsatilmoqda — pozitsiyalar backenddan jonli olinadi.
      </div>
      {markers.length === 0 ? (
        <div className="text-sm text-muted p-6 text-center">
          Hozircha onlayn haydovchilar yo'q.
        </div>
      ) : (
        <ul className="space-y-2">
          {markers.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => onMarkerClick?.(m.id)}
                className="w-full text-left card px-4 py-3 hover:bg-gray-50"
              >
                <div className="font-medium text-sm">{m.title ?? m.id}</div>
                {m.subtitle && (
                  <div className="text-xs text-muted">{m.subtitle}</div>
                )}
                <div className="text-xs text-muted mt-1">
                  {m.position.lat.toFixed(5)}, {m.position.lng.toFixed(5)}
                  {m.status ? ` · ${m.status}` : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
