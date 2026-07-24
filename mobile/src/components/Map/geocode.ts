// Geocoding lives in the Map layer because it's provider-tied. Screens call
// these four functions instead of importing expo-location directly, so the
// provider swap stays contained here.
//
// Provider: Yandex. Its address/POI data in Uzbekistan is far more complete
// than Google's, which matters most for a Bukhara taxi. Two separate Yandex
// products, each with its own dashboard key:
//   * Geocoder API  — forward/reverse (coords ⇄ address)
//   * Suggest API   — as-you-type place suggestions
// The on-device geocoder (expo-location) stays as the fallback for when a key
// is missing or a request fails.
//
// ⚠️ Language: the Geocoder does NOT support Uzbek (uz_UZ) — supported values
// are ru_RU/uk_UA/be_BY/en_RU/en_US/tr_TR — so reverse/forward addresses come
// back in Russian. The Suggest API *does* accept ISO-639-1 "uz", so typed
// suggestions can be Uzbek. This asymmetry is Yandex's, not ours.
import * as Location from "expo-location";
import type { Coords } from "./types";

// Geocoder and Suggest are billed as separate products, so they can have
// separate keys; fall back to a single shared key if that's how it was issued.
const SHARED = process.env.EXPO_PUBLIC_YANDEX_API_KEY ?? "";
const GEOCODER_KEY = process.env.EXPO_PUBLIC_YANDEX_GEOCODER_KEY || SHARED;
const SUGGEST_KEY = process.env.EXPO_PUBLIC_YANDEX_SUGGEST_KEY || SHARED;

// App language is "uz" or "ru". The Suggest API takes it as ISO-639-1 directly.
const LANG = process.env.EXPO_PUBLIC_MAPS_LANGUAGE || "uz";
// The Geocoder needs a locale from its fixed list; uz_UZ isn't on it, so Uzbek
// falls to Russian (the standard for local toponyms in Uzbekistan anyway).
const GEOCODER_LANG = LANG === "en" ? "en_US" : "ru_RU";

const GEOCODE_URL = "https://geocode-maps.yandex.ru/v1";
const SUGGEST_URL = "https://suggest-maps.yandex.ru/v1/suggest";

// Bias toward Bukhara city; the span roughly covers Buxoro Viloyati.
const BUKHARA = { lat: 39.767, lng: 64.421 };
const LL = `${BUKHARA.lng},${BUKHARA.lat}`; // Yandex order: longitude,latitude
const SPN = "1.0,1.0"; // ~degrees, wide enough for the whole region

/** Coordinates → a short human-readable address. Never throws. */
export async function reverseGeocode(coords: Coords): Promise<string> {
  if (GEOCODER_KEY) {
    const y = await yandexReverse(coords);
    if (y) return y;
  }
  return deviceReverse(coords);
}

/** Address text → coordinates (first match), biased to Bukhara. Or null. */
export async function searchAddress(query: string): Promise<Coords | null> {
  const q = query.trim();
  if (!q) return null;
  if (GEOCODER_KEY) {
    const y = await yandexForward(q);
    if (y) return y;
  }
  return deviceForward(q);
}

// ── Suggest (as-you-type suggestions, Bukhara-biased) ─────────────────────

export interface PlaceSuggestion {
  id: string; // Yandex object uri (resolved later), or the raw text as fallback
  primary: string; // main line (venue/street)
  secondary: string; // context line (district, city)
}

/** Typed text → up to 6 suggestions, biased to Bukhara. [] when the key is
 *  missing or the request fails. Never throws. */
export async function suggestPlaces(query: string): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (!SUGGEST_KEY || q.length < 2) return [];
  try {
    const url =
      `${SUGGEST_URL}?apikey=${SUGGEST_KEY}&text=${encodeURIComponent(q)}` +
      `&lang=${LANG}&results=6&ll=${LL}&spn=${SPN}` +
      `&types=geo,biz&print_address=1&attrs=uri`;
    const data = await fetchJson(url);
    const results: any[] = data?.results ?? [];
    return results.slice(0, 6).map((r) => {
      const primary = r.title?.text ?? "";
      const secondary =
        r.subtitle?.text ?? r.address?.formatted_address ?? "";
      // Prefer the uri (exact object → precise coords); else fall back to the
      // text, which placeCoords forward-geocodes.
      const id = r.uri ?? `${primary}${secondary ? `, ${secondary}` : ""}`;
      return { id, primary, secondary };
    });
  } catch {
    return [];
  }
}

/** Resolve a suggestion to coordinates. Null on failure. */
export async function placeCoords(id: string): Promise<Coords | null> {
  if (!GEOCODER_KEY) return null;
  // A Yandex object uri resolves to exact coordinates via the Geocoder's uri
  // param; anything else is plain text we forward-geocode.
  if (id.includes("://")) {
    try {
      const url =
        `${GEOCODE_URL}/?apikey=${GEOCODER_KEY}&uri=${encodeURIComponent(id)}` +
        `&format=json&lang=${GEOCODER_LANG}`;
      const point = firstPoint(await fetchJson(url));
      if (point) return point;
    } catch {
      // fall through to a text search
    }
  }
  return yandexForward(id);
}

// ── Yandex Geocoder ───────────────────────────────────────────────────────

async function yandexReverse(coords: Coords): Promise<string | null> {
  try {
    const url =
      `${GEOCODE_URL}/?apikey=${GEOCODER_KEY}` +
      `&geocode=${coords.lng},${coords.lat}` + // lon,lat
      `&format=json&lang=${GEOCODER_LANG}&kind=house&results=1`;
    const geoObject = firstGeoObject(await fetchJson(url));
    if (!geoObject) return null;
    // `name` is the most specific line (street + house); `description` is the
    // hierarchy above it. Prefer name, then the full formatted text.
    return (
      geoObject.name ||
      geoObject.metaDataProperty?.GeocoderMetaData?.text ||
      null
    );
  } catch {
    return null;
  }
}

async function yandexForward(query: string): Promise<Coords | null> {
  try {
    const url =
      `${GEOCODE_URL}/?apikey=${GEOCODER_KEY}` +
      `&geocode=${encodeURIComponent(query)}` +
      `&format=json&lang=${GEOCODER_LANG}&ll=${LL}&spn=${SPN}&results=1`;
    return firstPoint(await fetchJson(url));
  } catch {
    return null;
  }
}

/** First GeoObject in a Yandex geocoder response, or null. */
function firstGeoObject(data: any): any | null {
  const member =
    data?.response?.GeoObjectCollection?.featureMember?.[0];
  return member?.GeoObject ?? null;
}

/** Coordinates of the first result. Yandex Point.pos is "lon lat". */
function firstPoint(data: any): Coords | null {
  const pos: string | undefined = firstGeoObject(data)?.Point?.pos;
  if (!pos) return null;
  const [lng, lat] = pos.split(" ").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

// ── On-device geocoder (fallback; phone-locale output) ────────────────────

async function deviceReverse(coords: Coords): Promise<string> {
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: coords.lat,
      longitude: coords.lng,
    });
    const a = results[0];
    if (!a) return fallbackLabel(coords);
    const parts = [
      a.name ?? a.street,
      a.streetNumber,
      a.district ?? a.subregion,
      a.city ?? a.region,
    ].filter((p): p is string => Boolean(p) && p !== "null");
    const seen = new Set<string>();
    const label = parts.filter((p) => !seen.has(p) && seen.add(p)).join(", ");
    return label || fallbackLabel(coords);
  } catch {
    return fallbackLabel(coords);
  }
}

async function deviceForward(query: string): Promise<Coords | null> {
  try {
    const results = await Location.geocodeAsync(query);
    const r = results[0];
    return r ? { lat: r.latitude, lng: r.longitude } : null;
  } catch {
    return null;
  }
}

function fallbackLabel(coords: Coords): string {
  return `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
}
