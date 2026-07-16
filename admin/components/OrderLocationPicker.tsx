"use client";

// Pickup + destination picker for the Orders page: two Bukhara-biased,
// Uzbek address searches (Google Places) that stay in sync with one map you can
// click to drop/adjust either point.
import {
  GoogleMap,
  MarkerF,
  PolylineF,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BUKHARA_CENTER,
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_ID,
  GOOGLE_MAPS_LIBRARIES,
  MAPS_LANGUAGE,
} from "@/lib/maps";

export type Loc = { lat: number; lng: number; address: string };
type Which = "pickup" | "destination";

// Bias predictions to the Buxoro viloyati bounding box.
const BIAS_BOUNDS = { north: 41.5, south: 38.9, east: 65.4, west: 62.1 };

export function OrderLocationPicker({
  pickup,
  destination,
  onChange,
}: {
  pickup: Loc | null;
  destination: Loc | null;
  onChange: (which: Which, loc: Loc) => void;
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_ID,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    language: MAPS_LANGUAGE,
    region: "UZ",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const [active, setActive] = useState<Which>("pickup");
  const acRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesRef = useRef<google.maps.places.PlacesService | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    acRef.current = new google.maps.places.AutocompleteService();
    placesRef.current = new google.maps.places.PlacesService(
      document.createElement("div"),
    );
    geocoderRef.current = new google.maps.Geocoder();
  }, [isLoaded]);

  const reverseGeocode = useCallback(
    (lat: number, lng: number, which: Which) => {
      const g = geocoderRef.current;
      const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      if (!g) {
        onChange(which, { lat, lng, address: fallback });
        return;
      }
      g.geocode({ location: { lat, lng }, language: MAPS_LANGUAGE }, (res, status) => {
        onChange(which, {
          lat,
          lng,
          address:
            status === "OK" && res?.[0]?.formatted_address
              ? res[0].formatted_address
              : fallback,
        });
      });
    },
    [onChange],
  );

  const center = pickup ?? destination ?? BUKHARA_CENTER;

  return (
    <div className="space-y-3">
      <SearchField
        label="Qayerdan (olib ketish)"
        value={pickup}
        acRef={acRef}
        placesRef={placesRef}
        onPick={(loc) => onChange("pickup", loc)}
        onFocusActive={() => setActive("pickup")}
      />
      <SearchField
        label="Qayerga (manzil)"
        value={destination}
        acRef={acRef}
        placesRef={placesRef}
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

      {loadError ? (
        <div className="h-[280px] flex items-center justify-center text-sm text-red-600 card">
          Google xaritasini yuklab bo‘lmadi.
        </div>
      ) : !isLoaded ? (
        <div className="h-[280px] flex items-center justify-center text-sm text-muted card">
          Xarita yuklanmoqda…
        </div>
      ) : (
        <div className="card overflow-hidden">
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: 280 }}
            center={center}
            zoom={12}
            options={{ streetViewControl: false, mapTypeControl: false }}
            onClick={(e) => {
              if (e.latLng) reverseGeocode(e.latLng.lat(), e.latLng.lng(), active);
            }}
          >
            {pickup && <MarkerF position={pickup} label="A" />}
            {destination && <MarkerF position={destination} label="B" />}
            {pickup && destination && (
              <PolylineF
                path={[pickup, destination]}
                options={{ strokeColor: "#2563eb", strokeWeight: 3 }}
              />
            )}
          </GoogleMap>
        </div>
      )}
    </div>
  );
}

function SearchField({
  label,
  value,
  acRef,
  placesRef,
  onPick,
  onFocusActive,
}: {
  label: string;
  value: Loc | null;
  acRef: React.RefObject<google.maps.places.AutocompleteService | null>;
  placesRef: React.RefObject<google.maps.places.PlacesService | null>;
  onPick: (loc: Loc) => void;
  onFocusActive: () => void;
}) {
  const [query, setQuery] = useState("");
  const [preds, setPreds] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [editing, setEditing] = useState(false);
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ac = acRef.current;
    const q = query.trim();
    if (timer.current) clearTimeout(timer.current);
    if (!ac || !editing || q.length < 2) {
      setPreds([]);
      return;
    }
    timer.current = setTimeout(() => {
      if (!tokenRef.current) {
        tokenRef.current = new google.maps.places.AutocompleteSessionToken();
      }
      ac.getPlacePredictions(
        {
          input: q,
          language: MAPS_LANGUAGE,
          componentRestrictions: { country: "uz" },
          bounds: BIAS_BOUNDS,
          sessionToken: tokenRef.current,
        },
        (p) => setPreds(p ?? []),
      );
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, editing, acRef]);

  function pick(pred: google.maps.places.AutocompletePrediction) {
    const svc = placesRef.current;
    setPreds([]);
    setEditing(false);
    if (!svc) return;
    svc.getDetails(
      {
        placeId: pred.place_id,
        fields: ["geometry", "formatted_address", "name"],
        sessionToken: tokenRef.current ?? undefined,
        language: MAPS_LANGUAGE,
      },
      (place, status) => {
        tokenRef.current = null;
        if (status === "OK" && place?.geometry?.location) {
          const loc = place.geometry.location;
          onPick({
            lat: loc.lat(),
            lng: loc.lng(),
            address: place.formatted_address ?? pred.description,
          });
        }
      },
    );
  }

  const display = editing ? query : value?.address ?? "";

  return (
    <div className="relative">
      <label className="label">{label}</label>
      <input
        className="input"
        value={display}
        placeholder="Manzil qidirish yoki xaritada bosing…"
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
      {editing && preds.length > 0 && (
        <div className="absolute z-20 mt-1 w-full card p-1 max-h-64 overflow-auto shadow-[var(--shadow-md)]">
          {preds.map((p) => (
            <button
              key={p.place_id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              className="block w-full text-left px-3 py-2 rounded-md hover:bg-[var(--surface-2)]"
            >
              <div className="text-sm font-medium">
                {p.structured_formatting?.main_text ?? p.description}
              </div>
              {p.structured_formatting?.secondary_text && (
                <div className="text-xs text-muted">
                  {p.structured_formatting.secondary_text}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
