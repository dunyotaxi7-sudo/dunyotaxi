"use client";

// The ONLY file allowed to touch the Yandex Maps JS API. The rest of the app
// depends on LiveMapProps alone, so swapping providers stays contained here.
//
// Yandex coordinates are [longitude, latitude] — the opposite of our MapPoint,
// so every conversion goes through toLngLat().

import { useEffect, useRef, useState } from "react";
import {
  YANDEX_MAPS_KEY,
  loadYmaps3,
  type LngLat,
  type YMapInstance,
  type YMaps3,
} from "@/lib/yandex";
import type { LiveMapProps, MapMarker, MapPoint, MarkerKind } from "./types";

const BRAND = "#2563eb";

function toLngLat(p: MapPoint): LngLat {
  return [p.lng, p.lat];
}

/** A closed ring, as Polygon geometry expects. */
function toRing(points: MapPoint[]): LngLat[] {
  const ring = points.map(toLngLat);
  const [first] = ring;
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push(first);
  }
  return ring;
}

// The same car glyph the sidebar uses, so a driver reads the same everywhere.
const CAR_SVG =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fff" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10' +
  's-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12' +
  'v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/>' +
  '<circle cx="17" cy="17" r="2"/></svg>';

const PIN_COLOR: Record<MarkerKind, string> = {
  driver: BRAND,
  pickup: "#16a34a",
  dropoff: "#dc2626",
};

function markerElement(m: MapMarker): HTMLElement {
  const kind: MarkerKind = m.kind ?? "driver";
  const isCar = kind === "driver";
  const size = isCar ? 30 : 16;
  const el = document.createElement("div");
  el.style.cssText =
    `width:${size}px;height:${size}px;border-radius:50%;background:${PIN_COLOR[kind]};` +
    "border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);" +
    "display:flex;align-items:center;justify-content:center;" +
    "transform:translate(-50%,-50%);cursor:pointer;";
  if (isCar) el.innerHTML = CAR_SVG;
  el.title = m.title ?? "";
  return el;
}

export function YandexLiveMap({
  center,
  zoom = 13,
  markers,
  polygons,
  route,
  onMarkerClick,
}: LiveMapProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<YMaps3 | null>(null);
  const mapRef = useRef<YMapInstance | null>(null);
  // Live children, keyed so each poll updates in place instead of re-creating.
  const markersRef = useRef<Map<string, { obj: any; el: HTMLElement }>>(new Map());
  const shapesRef = useRef<{ polys: any[]; route: any | null }>({ polys: [], route: null });
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<MapMarker | null>(null);

  // Keep the click handler fresh without re-creating markers.
  const clickRef = useRef(onMarkerClick);
  clickRef.current = onMarkerClick;

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    if (!boxRef.current) return;
    loadYmaps3()
      .then((y) => {
        if (cancelled || !boxRef.current) return;
        const map = new y.YMap(boxRef.current, {
          location: { center: toLngLat(center), zoom },
        });
        map.addChild(new y.YMapDefaultSchemeLayer({}));
        map.addChild(new y.YMapDefaultFeaturesLayer({}));
        apiRef.current = y;
        mapRef.current = map;
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
      markersRef.current.clear();
      shapesRef.current = { polys: [], route: null };
    };
    // Created once; `center`/`zoom` changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the caller's centre when it moves (e.g. a ride detail loading).
  useEffect(() => {
    if (state !== "ready") return;
    mapRef.current?.setLocation({ center: toLngLat(center), zoom, duration: 250 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, zoom, state]);

  // Service-area rings.
  useEffect(() => {
    const y = apiRef.current;
    const map = mapRef.current;
    if (!y || !map || state !== "ready") return;
    for (const p of shapesRef.current.polys) map.removeChild(p);
    shapesRef.current.polys = (polygons ?? []).map((ring) => {
      const f = new y.YMapFeature({
        geometry: { type: "Polygon", coordinates: [toRing(ring)] },
        style: { stroke: [{ color: BRAND, width: 1.5 }], fill: BRAND, fillOpacity: 0.05 },
      });
      map.addChild(f);
      return f;
    });
  }, [polygons, state]);

  // Route line.
  useEffect(() => {
    const y = apiRef.current;
    const map = mapRef.current;
    if (!y || !map || state !== "ready") return;
    const s = shapesRef.current;
    if (s.route) {
      map.removeChild(s.route);
      s.route = null;
    }
    if (route && route.length >= 2) {
      s.route = new y.YMapFeature({
        geometry: { type: "LineString", coordinates: route.map(toLngLat) },
        style: { stroke: [{ color: BRAND, width: 4 }] },
      });
      map.addChild(s.route);
    }
  }, [route, state]);

  // Markers: add new, move existing, drop the ones that went away.
  useEffect(() => {
    const y = apiRef.current;
    const map = mapRef.current;
    if (!y || !map || state !== "ready") return;
    const live = markersRef.current;
    const seen = new Set<string>();

    for (const m of markers) {
      seen.add(m.id);
      const coords = toLngLat(m.position);
      const existing = live.get(m.id);
      if (existing) {
        existing.obj.update({ coordinates: coords });
        existing.el.title = m.title ?? "";
      } else {
        const el = markerElement(m);
        const obj = new y.YMapMarker(
          {
            coordinates: coords,
            onClick: () => {
              setSelected(m);
              clickRef.current?.(m.id);
            },
          },
          el,
        );
        map.addChild(obj);
        live.set(m.id, { obj, el });
      }
    }
    for (const [id, entry] of live) {
      if (!seen.has(id)) {
        map.removeChild(entry.obj);
        live.delete(id);
      }
    }
    // A selected driver who has gone offline shouldn't keep its card open.
    setSelected((cur) => (cur && seen.has(cur.id) ? cur : null));
  }, [markers, state]);

  if (!YANDEX_MAPS_KEY) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center text-sm text-amber-800">
        Yandex xarita kaliti sozlanmagan (<code>NEXT_PUBLIC_YANDEX_MAPS_KEY</code>).
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div ref={boxRef} className="h-full w-full" />
      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted bg-[var(--surface)]">
          Xarita yuklanmoqda…
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-red-600 bg-[var(--surface)]">
          Yandex xaritasini yuklab bo‘lmadi. Kalit va ruxsat etilgan domenlarni tekshiring.
        </div>
      )}
      {selected && (
        <div className="absolute left-3 bottom-3 z-10 card px-3 py-2 shadow-[var(--shadow-md)] max-w-[260px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">
                {selected.title ?? "Haydovchi"}
              </div>
              {selected.subtitle && (
                <div className="text-xs text-muted truncate">{selected.subtitle}</div>
              )}
              {selected.status && (
                <div className="text-xs text-muted mt-0.5">{selected.status}</div>
              )}
            </div>
            <button
              className="text-muted text-sm leading-none"
              onClick={() => setSelected(null)}
              aria-label="Yopish"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
