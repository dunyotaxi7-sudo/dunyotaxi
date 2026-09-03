"use client";

// Pickup + destination picker for the Orders page: two Bukhara-biased Uzbek
// address searches (Yandex Suggest → Geocoder) that stay in sync with one map
// (Yandex JS API v3) you can click to drop/adjust either point.
//
// The map needs NEXT_PUBLIC_YANDEX_MAPS_KEY. Without it we degrade to a
// coordinates panel — search still works, only the tiles are missing.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BUKHARA,
  YANDEX_MAPS_KEY,
  hasGeocoderKey,
  hasSuggestKey,
  loadYmaps3,
  resolveSuggestion,
  reverseGeocode,
  suggest,
  type LngLat,
  type Suggestion,
  type YMapInstance,
  type YMaps3,
} from "@/lib/yandex";

export type Loc = { lat: number; lng: number; address: string };
type Which = "pickup" | "destination";

const MAP_HEIGHT = 280;

export function OrderLocationPicker({
  pickup,
  destination,
  onChange,
}: {
  pickup: Loc | null;
  destination: Loc | null;
  onChange: (which: Which, loc: Loc) => void;
}) {
  const [active, setActive] = useState<Which>("pickup");

  // Map click → reverse geocode → set the active point. Refs so the map's
  // click listener (created once) always sees the latest values.
  const activeRef = useRef(active);
  activeRef.current = active;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    const which = activeRef.current;
    // Set immediately with a coordinate label so the pin drops at once, then
    // replace with the address when the geocoder answers.
    onChangeRef.current(which, { lat, lng, address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
    const address = await reverseGeocode(lat, lng);
    onChangeRef.current(which, { lat, lng, address });
  }, []);

  return (
    <div className="space-y-3">
      <SearchField
        label="Qayerdan (olib ketish)"
        value={pickup}
        onPick={(loc) => onChange("pickup", loc)}
        onFocusActive={() => setActive("pickup")}
      />
      <SearchField
        label="Qayerga (manzil)"
        value={destination}
        onPick={(loc) => onChange("destination", loc)}
        onFocusActive={() => setActive("destination")}
      />

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted">Xaritada bosish o‘rnatadi:</span>
        {(["pickup", "destination"] as Which[]).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setActive(w)}
            className={`btn ${active === w ? "btn-primary" : "btn-ghost"} !py-1 !px-3`}
          >
            {w === "pickup" ? "Qayerdan" : "Qayerga"}
          </button>
        ))}
      </div>

      {YANDEX_MAPS_KEY ? (
        <YandexMap pickup={pickup} destination={destination} onClickPoint={handleMapClick} />
      ) : (
        <NoMapFallback pickup={pickup} destination={destination} />
      )}
    </div>
  );
}

// ── Map ──────────────────────────────────────────────────────────────────

function toLngLat(p: Loc): LngLat {
  return [p.lng, p.lat];
}

function markerEl(label: "A" | "B"): HTMLElement {
  const el = document.createElement("div");
  el.textContent = label;
  el.style.cssText =
    "width:26px;height:26px;border-radius:50%;display:flex;align-items:center;" +
    "justify-content:center;font:700 13px system-ui,sans-serif;color:#fff;" +
    "border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);" +
    "transform:translate(-50%,-50%);cursor:default;" +
    `background:${label === "A" ? "#2563eb" : "#dc2626"};`;
  return el;
}

function YandexMap({
  pickup,
  destination,
  onClickPoint,
}: {
  pickup: Loc | null;
  destination: Loc | null;
  onClickPoint: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<YMaps3 | null>(null);
  const mapRef = useRef<YMapInstance | null>(null);
  const markersRef = useRef<{ A?: any; B?: any; line?: any }>({});
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const onClickRef = useRef(onClickPoint);
  onClickRef.current = onClickPoint;

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    const el = containerRef.current;
    if (!el) return;
    loadYmaps3()
      .then((y) => {
        if (cancelled || !containerRef.current) return;
        const center: LngLat = pickup
          ? toLngLat(pickup)
          : destination
            ? toLngLat(destination)
            : [BUKHARA.lng, BUKHARA.lat];
        const map = new y.YMap(containerRef.current, {
          location: { center, zoom: 12 },
        });
        map.addChild(new y.YMapDefaultSchemeLayer({}));
        map.addChild(new y.YMapDefaultFeaturesLayer({}));
        map.addChild(
          new y.YMapListener({
            layer: "any",
            onClick: (_obj, event) => {
              const [lng, lat] = event.coordinates;
              onClickRef.current(lat, lng);
            },
          }),
        );
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
      markersRef.current = {};
    };
    // Initial center only; later moves are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep A/B markers and the connecting line in sync with the points.
  useEffect(() => {
    const y = apiRef.current;
    const map = mapRef.current;
    if (!y || !map || state !== "ready") return;
    const m = markersRef.current;

    const sync = (key: "A" | "B", loc: Loc | null) => {
      if (loc) {
        const coords = toLngLat(loc);
        if (m[key]) m[key].update({ coordinates: coords });
        else {
          m[key] = new y.YMapMarker({ coordinates: coords }, markerEl(key));
          map.addChild(m[key]);
        }
      } else if (m[key]) {
        map.removeChild(m[key]);
        m[key] = undefined;
      }
    };
    sync("A", pickup);
    sync("B", destination);

    if (pickup && destination) {
      const geometry = {
        type: "LineString" as const,
        coordinates: [toLngLat(pickup), toLngLat(destination)],
      };
      if (m.line) m.line.update({ geometry });
      else {
        m.line = new y.YMapFeature({
          geometry,
          style: { stroke: [{ color: "#2563eb", width: 3 }] },
        });
        map.addChild(m.line);
      }
    } else if (m.line) {
      map.removeChild(m.line);
      m.line = undefined;
    }
  }, [pickup, destination, state]);

  // Pan to a point when it is newly set (not on every address refinement).
  const lastKeys = useRef<{ A?: string; B?: string }>({});
  useEffect(() => {
    const map = mapRef.current;
    if (!map || state !== "ready") return;
    const key = (p: Loc | null) => (p ? `${p.lat.toFixed(6)},${p.lng.toFixed(6)}` : undefined);
    const a = key(pickup);
    const b = key(destination);
    const target =
      a && a !== lastKeys.current.A ? pickup : b && b !== lastKeys.current.B ? destination : null;
    lastKeys.current = { A: a, B: b };
    if (target) map.setLocation({ center: toLngLat(target), zoom: 14, duration: 300 });
  }, [pickup, destination, state]);

  return (
    <div className="card overflow-hidden relative" style={{ height: MAP_HEIGHT }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted bg-[var(--surface)]">
          Xarita yuklanmoqda…
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600 bg-[var(--surface)] px-4 text-center">
          Yandex xaritasini yuklab bo‘lmadi. Kalit va ruxsat etilgan domenlarni tekshiring.
        </div>
      )}
    </div>
  );
}

function NoMapFallback({ pickup, destination }: { pickup: Loc | null; destination: Loc | null }) {
  const fmt = (p: Loc | null) =>
    p ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : "—";
  return (
    <div className="card p-4 space-y-2" style={{ minHeight: 120 }}>
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
        Yandex xarita kaliti sozlanmagan (<code>NEXT_PUBLIC_YANDEX_MAPS_KEY</code>).
        Manzilni yuqoridagi qidiruv orqali tanlang — koordinatalar shu yerda ko‘rinadi.
      </div>
      <div className="text-sm"><span className="text-blue-600 font-semibold">A</span> Qayerdan: {fmt(pickup)}</div>
      <div className="text-sm"><span className="text-red-600 font-semibold">B</span> Qayerga: {fmt(destination)}</div>
    </div>
  );
}

// ── Search field (Suggest → Geocoder) ────────────────────────────────────

function SearchField({
  label,
  value,
  onPick,
  onFocusActive,
}: {
  label: string;
  value: Loc | null;
  onPick: (loc: Loc) => void;
  onFocusActive: () => void;
}) {
  const [query, setQuery] = useState("");
  const [preds, setPreds] = useState<Suggestion[]>([]);
  const [editing, setEditing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqSeq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (timer.current) clearTimeout(timer.current);
    if (!editing || q.length < 2) {
      setPreds([]);
      return;
    }
    const seq = ++reqSeq.current;
    timer.current = setTimeout(async () => {
      const list = await suggest(q);
      if (seq === reqSeq.current) setPreds(list); // drop stale responses
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, editing]);

  async function pick(s: Suggestion) {
    setPreds([]);
    setEditing(false);
    setResolving(true);
    try {
      const r = await resolveSuggestion(s.id);
      if (r) onPick({ lat: r.lat, lng: r.lng, address: s.address || r.address });
    } finally {
      setResolving(false);
    }
  }

  const display = editing ? query : value?.address ?? "";
  const missingKeys = !hasSuggestKey || !hasGeocoderKey;

  return (
    <div className="relative">
      <label className="label">{label}</label>
      <input
        className="input"
        value={display}
        placeholder={resolving ? "Aniqlanmoqda…" : "Manzil qidirish yoki xaritada bosing…"}
        onFocus={() => {
          onFocusActive();
          setEditing(true);
          setQuery(value?.address ?? "");
        }}
        onBlur={() => setTimeout(() => setEditing(false), 150)}
        onChange={(e) => {
          setEditing(true);
          setQuery(e.target.value);
        }}
      />
      {missingKeys && editing && (
        <div className="text-xs text-amber-700 mt-1">
          Yandex qidiruv kalitlari sozlanmagan — faqat xaritada bosish ishlaydi.
        </div>
      )}
      {editing && preds.length > 0 && (
        <div className="absolute z-20 mt-1 w-full card p-1 max-h-64 overflow-auto shadow-[var(--shadow-md)]">
          {preds.map((p, i) => (
            <button
              key={`${p.id}-${i}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              className="block w-full text-left px-3 py-2 rounded-md hover:bg-[var(--surface-2)]"
            >
              <div className="text-sm font-medium">{p.primary}</div>
              {p.secondary && <div className="text-xs text-muted">{p.secondary}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
