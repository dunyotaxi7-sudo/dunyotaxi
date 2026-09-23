"use client";

// Pickup + destination picker for the Orders page: two Bukhara-biased Uzbek
// address searches (Yandex Suggest → Geocoder) that stay in sync with one map
// (Yandex JS API v3) you can click to drop/adjust either point.
//
// The map needs NEXT_PUBLIC_YANDEX_MAPS_KEY. Without it we degrade to a
// coordinates panel — search still works, only the tiles are missing.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  type YMapChild,
  type Suggestion,
  type YMapInstance,
  type YMaps3,
} from "@/lib/yandex";
import { mapApi, placesApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import type { OnlineDriver, Place } from "@/lib/types";

export type Loc = { lat: number; lng: number; address: string };
type Which = "pickup" | "destination";

// Operators pick points by clicking, and a short map made that fiddly — a
// misplaced pin costs more time than a tall map costs screen space. Sized off
// the viewport so a big call-centre monitor gets a big map, with a floor that
// keeps it usable on a laptop and a ceiling so it never outgrows the page.
const MAP_CLASS = "h-[58vh] min-h-[440px] max-h-[760px]";

// Marker colours, shared with the field dots so "A / blue" needs no explaining.
const PICKUP_COLOR = "#2563eb";
const DEST_COLOR = "#dc2626";

export function OrderLocationPicker({
  pickup,
  destination,
  onChange,
  onClear,
  single,
  pickupLabel,
}: {
  pickup: Loc | null;
  destination: Loc | null;
  onChange: (which: Which, loc: Loc) => void;
  /** Clearing the destination is how an operator turns this into a metered order. */
  onClear?: (which: Which) => void;
  /** One point, no destination: used where a single place is being pinned.
      Also drops what only makes sense while taking an order — the live driver
      pins, and the offer to save the point, which would be circular there. */
  single?: boolean;
  pickupLabel?: string;
}) {
  const [active, setActive] = useState<Which>("pickup");
  // Most orders are typed, not clicked, so the map can be folded away to give
  // the form back to the keyboard. Deliberately not persisted: restoring it
  // would mean setting state from storage in an effect, and the map's default
  // being open is the safer surprise.
  const [mapOpen, setMapOpen] = useState(true);

  // Map click → reverse geocode → set the active point. Refs so the map's
  // click listener (created once) always sees the latest values.
  const activeRef = useRef(active);
  activeRef.current = active;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Who is out there right now. The operator is choosing a pickup point, so
  // seeing which cars are near it — and which of them are free — is the whole
  // reason to look at this map.
  const drivers = useQuery({
    queryKey: ["map-online-drivers"],
    queryFn: () => mapApi.onlineDrivers(),
    refetchInterval: 10000,
    enabled: mapOpen && !single,
  });

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
        label={pickupLabel ?? "Qayerdan (olib ketish)"}
        dotColor={PICKUP_COLOR}
        marker="A"
        value={pickup}
        savedPlaces={!single}
        offerToSave={!single}
        onPick={(loc) => onChange("pickup", loc)}
        onFocusActive={() => setActive("pickup")}
        onClear={() => onClear?.("pickup")}
      />
      {!single && (
        <SearchField
          label="Qayerga (manzil)"
          dotColor={DEST_COLOR}
          marker="B"
          value={destination}
          optional
          savedPlaces
          offerToSave
          onPick={(loc) => onChange("destination", loc)}
          onFocusActive={() => setActive("destination")}
          onClear={() => onClear?.("destination")}
        />
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Which point a map click sets. Previously two small ghost buttons
            that were easy to overlook, so clicks landed on the wrong point. */}
        {/* Left out rather than hidden with a class: `hidden` and `inline-flex`
            are both display utilities, and which one wins is decided by
            Tailwind's ordering, not by the order written here. */}
        {single ? (
          <span />
        ) : (
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-[var(--surface-2)]">
            {(["pickup", "destination"] as Which[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setActive(w)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active === w
                    ? "bg-[var(--surface)] font-medium shadow-[var(--shadow-sm)]"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: w === "pickup" ? PICKUP_COLOR : DEST_COLOR }}
                />
                {w === "pickup" ? "Qayerdan" : "Qayerga"}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setMapOpen((v) => !v)}
          className="btn btn-ghost text-xs"
        >
          {mapOpen ? "Xaritani yashirish" : "Xaritani ko‘rsatish"}
        </button>
      </div>

      {mapOpen ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>
              {single ? (
                <>
                  Xaritada bosib nuqtani belgilang.
                </>
              ) : (
                <>
                  Xaritada bosish{" "}
                  <b>{active === "pickup" ? "Qayerdan" : "Qayerga"}</b> nuqtasini
                  o‘rnatadi.
                </>
              )}
            </span>
            {/* Without this the pins are two shades of "a car is here". */}
            {!single && (
              <span className="flex items-center gap-3">
                <Legend color="#16a34a">
                  Bo‘sh ({drivers.data?.filter((d) => !d.busy).length ?? 0})
                </Legend>
                <Legend color="#f59e0b">
                  Band ({drivers.data?.filter((d) => d.busy).length ?? 0})
                </Legend>
              </span>
            )}
          </div>
          {YANDEX_MAPS_KEY ? (
            <YandexMap
              pickup={pickup}
              destination={destination}
              drivers={drivers.data ?? []}
              onClickPoint={handleMapClick}
            />
          ) : (
            <NoMapFallback pickup={pickup} destination={destination} />
          )}
        </>
      ) : null}
    </div>
  );
}

function Legend({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: color }}
      />
      {children}
    </span>
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

type DriverPin = {
  marker: YMapChild & { update: (props: { coordinates: LngLat }) => void };
  busy: boolean;
};

function driverEl(busy: boolean): HTMLElement {
  const el = document.createElement("div");
  el.textContent = "🚗";
  el.title = busy ? "Band" : "Bo'sh";
  el.style.cssText =
    "width:24px;height:24px;border-radius:50%;display:flex;align-items:center;" +
    "justify-content:center;font-size:13px;border:2px solid #fff;" +
    "box-shadow:0 1px 3px rgba(0,0,0,.3);transform:translate(-50%,-50%);" +
    // Green = free, amber = on a trip. An operator choosing a pickup point
    // needs to see who could actually take the order, not just who is online.
    `background:${busy ? "#f59e0b" : "#16a34a"};`;
  return el;
}

function YandexMap({
  pickup,
  destination,
  drivers,
  onClickPoint,
}: {
  pickup: Loc | null;
  destination: Loc | null;
  drivers: OnlineDriver[];
  onClickPoint: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<YMaps3 | null>(null);
  const mapRef = useRef<YMapInstance | null>(null);
  const markersRef = useRef<{ A?: any; B?: any; line?: any }>({});
  // Keyed by driver id so a moving car is updated rather than re-added. The
  // busy flag is kept alongside because the pin's colour lives in its DOM
  // element, so a change of availability needs a new marker, not an update.
  const driverMarkersRef = useRef<Map<string, DriverPin>>(new Map());
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

  // Live driver pins. Kept separate from the A/B markers: they change on their
  // own schedule (a poll every few seconds) and must not disturb the points
  // the operator is placing.
  useEffect(() => {
    const y = apiRef.current;
    const map = mapRef.current;
    if (!y || !map || state !== "ready") return;
    const live = driverMarkersRef.current;
    const seen = new Set<string>();

    for (const d of drivers) {
      seen.add(d.driver_id);
      const coords: LngLat = [d.lng, d.lat];
      const existing = live.get(d.driver_id);
      if (existing) {
        existing.marker.update({ coordinates: coords });
        // Re-create only when availability changed — the pin's colour is part
        // of the element, not of its coordinates.
        if (existing.busy !== d.busy) {
          map.removeChild(existing.marker);
          const marker = new y.YMapMarker({ coordinates: coords }, driverEl(d.busy));
          map.addChild(marker);
          live.set(d.driver_id, { marker, busy: d.busy });
        }
      } else {
        const marker = new y.YMapMarker({ coordinates: coords }, driverEl(d.busy));
        map.addChild(marker);
        live.set(d.driver_id, { marker, busy: d.busy });
      }
    }

    // Drivers who went offline since the last poll.
    for (const [id, entry] of live) {
      if (!seen.has(id)) {
        map.removeChild(entry.marker);
        live.delete(id);
      }
    }
  }, [drivers, state]);

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
    <div className={`card overflow-hidden relative ${MAP_CLASS}`}>
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
  dotColor,
  marker,
  value,
  optional,
  savedPlaces: withSavedPlaces,
  offerToSave,
  onPick,
  onFocusActive,
  onClear,
}: {
  label: string;
  /** Matches this field's pin on the map, so "A" needs no legend. */
  dotColor: string;
  marker: "A" | "B";
  value: Loc | null;
  optional?: boolean;
  /** Offer saved landmarks alongside the geocoder's suggestions. */
  savedPlaces?: boolean;
  /** Offer to save whatever point this field holds as a new landmark. */
  offerToSave?: boolean;
  onPick: (loc: Loc) => void;
  onFocusActive: () => void;
  onClear?: () => void;
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

  // Saved places share the address box rather than getting one of their own:
  // the operator types what the caller said and the landmark comes up first,
  // without having to know in advance whether it was ever saved. With the box
  // empty they are listed on their own — that is what makes them discoverable.
  const places = useQuery({
    queryKey: ["places", "picker", query.trim().length >= 2 ? query.trim() : ""],
    queryFn: () => placesApi.list(query.trim().length >= 2 ? query.trim() : undefined),
    enabled: editing && Boolean(withSavedPlaces),
    staleTime: 60_000,
  });
  const savedPlaces = withSavedPlaces
    ? (places.data ?? []).slice(0, query.trim().length >= 2 ? 6 : 5)
    : [];

  function pickPlace(p: Place) {
    setPreds([]);
    setEditing(false);
    // The name, not the street: it is what the caller said and what the driver
    // is shown. The street stays in the place record for telling names apart.
    onPick({ lat: p.lat, lng: p.lng, address: p.name });
  }

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
      <div className="flex items-center justify-between gap-2">
        <label className="label flex items-center gap-2">
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ background: dotColor }}
          >
            {marker}
          </span>
          {label}
          {optional ? (
            <span className="text-xs font-normal text-muted">
              — bo‘sh qoldirsangiz, hisoblagich bo‘yicha
            </span>
          ) : null}
        </label>
        {value && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-muted hover:text-foreground"
          >
            Tozalash
          </button>
        ) : null}
      </div>
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
      {editing && (savedPlaces.length > 0 || preds.length > 0) && (
        <div className="absolute z-20 mt-1 w-full card p-1 max-h-72 overflow-auto shadow-[var(--shadow-md)]">
          {savedPlaces.length > 0 && (
            <>
              <div className="px-3 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                Saqlangan joylar
              </div>
              {savedPlaces.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickPlace(p)}
                  className="block w-full text-left px-3 py-2 rounded-md hover:bg-[var(--surface-2)]"
                >
                  <div className="text-sm font-medium">★ {p.name}</div>
                  {p.address && (
                    <div className="text-xs text-muted">{p.address}</div>
                  )}
                </button>
              ))}
              {preds.length > 0 && <div className="my-1 border-t border-border" />}
            </>
          )}
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
      {/* Keyed on the point: moving the pin is a new question, so the name
          being typed and the last confirmation reset with it. */}
      {offerToSave && (
        <SavePlaceRow
          key={value ? `${value.lat},${value.lng}` : "none"}
          value={value}
        />
      )}
    </div>
  );
}


// ── Saving a point as a place ────────────────────────────────────────

/** Turn the point in a field into a saved place, without leaving the call.

    A landmark is usually discovered mid-order — the caller names somewhere the
    search did not know, and the operator finds it on the map. Sending them to
    another page to record that means it never gets recorded, so the offer is
    made right where the point already is. */
function SavePlaceRow({ value }: { value: Loc | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      placesApi.create({
        name: name.trim(),
        lat: value!.lat,
        lng: value!.lng,
        address: value!.address,
      }),
    onSuccess: (place) => {
      void qc.invalidateQueries({ queryKey: ["places"] });
      setOpen(false);
      setSaved(place.name);
    },
  });

  if (!value) return null;

  if (saved) {
    return (
      <div className="mt-1 text-xs text-green-700">
        ★ {saved} saqlangan joylarga qo‘shildi
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setName(value.address ?? "");
          save.reset();
          setOpen(true);
        }}
        className="mt-1 text-xs text-primary hover:underline"
      >
        + Bu nuqtani saqlangan joy sifatida saqlash
      </button>
    );
  }

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex items-center gap-2">
        <input
          className="input h-8 text-sm"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder="Joy nomi — mijoz aytgandek"
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim().length >= 2) save.mutate();
            if (e.key === "Escape") setOpen(false);
          }}
        />
        <button
          type="button"
          className="btn btn-primary !py-1.5 text-xs"
          disabled={name.trim().length < 2 || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "…" : "Saqlash"}
        </button>
        <button
          type="button"
          className="btn btn-ghost !py-1.5 text-xs"
          onClick={() => setOpen(false)}
        >
          Bekor
        </button>
      </div>
      {save.isError && (
        <div className="text-xs text-red-600">{apiError(save.error)}</div>
      )}
    </div>
  );
}
