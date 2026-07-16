// Geocoding lives in the Map layer because it's provider-tied. Screens call
// these instead of importing expo-location directly, so a Yandex swap stays
// contained here.
//
// Primary path: Google Geocoding API with `language=uz` (or EXPO_PUBLIC_MAPS_LANGUAGE)
// so search results and addresses come back in Uzbek. The on-device geocoder
// (expo-location) only speaks the phone's locale, so it's the fallback for when
// the key is missing or the web request fails.
import * as Location from "expo-location";
import type { Coords } from "./types";

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
// "uz" (O'zbekcha) by default; set to "ru" for Russian.
const LANG = process.env.EXPO_PUBLIC_MAPS_LANGUAGE || "uz";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const AUTOCOMPLETE_URL =
  "https://maps.googleapis.com/maps/api/place/autocomplete/json";
const DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

// Bias autocomplete toward Bukhara city; the radius roughly covers Buxoro Viloyati.
const BUKHARA = { lat: 39.767, lng: 64.421 };
const BIAS_RADIUS_M = 120_000;

/** Coordinates → a short human-readable address in the map language. Never throws. */
export async function reverseGeocode(coords: Coords): Promise<string> {
  if (KEY) {
    const google = await googleReverse(coords);
    if (google) return google;
  }
  return deviceReverse(coords);
}

/** Address text → coordinates (first match), biased to Uzbekistan. Or null. */
export async function searchAddress(query: string): Promise<Coords | null> {
  const q = query.trim();
  if (!q) return null;
  if (KEY) {
    const google = await googleForward(q);
    if (google) return google;
  }
  return deviceForward(q);
}

// ── Places Autocomplete (as-you-type suggestions, Bukhara-biased) ─────────

export interface PlaceSuggestion {
  id: string; // Google place_id
  primary: string; // main line (e.g. venue/street)
  secondary: string; // context line (e.g. district, city)
}

/** Typed text → up to 6 place suggestions in the map language, biased to
 *  Bukhara. Returns [] when the key/Places API is unavailable. Never throws. */
export async function suggestPlaces(query: string): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (!KEY || q.length < 2) return [];
  try {
    const url =
      `${AUTOCOMPLETE_URL}?input=${encodeURIComponent(q)}` +
      `&language=${LANG}&components=country:uz` +
      `&location=${BUKHARA.lat},${BUKHARA.lng}&radius=${BIAS_RADIUS_M}&key=${KEY}`;
    const data = await fetchJson(url);
    if (data?.status !== "OK" || !data.predictions?.length) return [];
    return data.predictions.slice(0, 6).map((p: any) => ({
      id: p.place_id as string,
      primary: p.structured_formatting?.main_text ?? p.description,
      secondary: p.structured_formatting?.secondary_text ?? "",
    }));
  } catch {
    return [];
  }
}

/** Resolve a suggestion (place_id) to coordinates. Null on failure. */
export async function placeCoords(placeId: string): Promise<Coords | null> {
  if (!KEY) return null;
  try {
    const url =
      `${DETAILS_URL}?place_id=${placeId}&fields=geometry` +
      `&language=${LANG}&key=${KEY}`;
    const data = await fetchJson(url);
    const loc = data?.result?.geometry?.location;
    return loc ? { lat: loc.lat, lng: loc.lng } : null;
  } catch {
    return null;
  }
}

// ── Google Geocoding API (language-controlled) ────────────────────────────

async function googleReverse(coords: Coords): Promise<string | null> {
  try {
    const url =
      `${GEOCODE_URL}?latlng=${coords.lat},${coords.lng}` +
      `&language=${LANG}&region=uz&key=${KEY}`;
    const data = await fetchJson(url);
    if (data?.status !== "OK" || !data.results?.length) return null;
    const r = data.results[0];
    return shortLabel(r.address_components) || r.formatted_address || null;
  } catch {
    return null;
  }
}

async function googleForward(query: string): Promise<Coords | null> {
  try {
    const url =
      `${GEOCODE_URL}?address=${encodeURIComponent(query)}` +
      `&language=${LANG}&region=uz&components=country:UZ&key=${KEY}`;
    const data = await fetchJson(url);
    if (data?.status !== "OK" || !data.results?.length) return null;
    const loc = data.results[0].geometry?.location;
    return loc ? { lat: loc.lat, lng: loc.lng } : null;
  } catch {
    return null;
  }
}

type Component = { long_name: string; short_name: string; types: string[] };

/** Build a compact "street, district, city" label from Google components. */
function shortLabel(components: Component[] | undefined): string {
  if (!components?.length) return "";
  const pick = (type: string) =>
    components.find((c) => c.types.includes(type))?.long_name;
  const street = pick("route");
  const number = pick("street_number");
  const parts = [
    number ? `${street ?? ""} ${number}`.trim() : street,
    pick("sublocality") ?? pick("neighborhood"),
    pick("locality") ?? pick("administrative_area_level_2"),
  ].filter((p): p is string => Boolean(p));
  const seen = new Set<string>();
  return parts.filter((p) => !seen.has(p) && seen.add(p)).join(", ");
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
