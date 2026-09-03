// Yandex Maps for the admin (order picker). Three separate Yandex products,
// each with its own key from the Developer Cabinet:
//   * JavaScript API   — renders the map (NEXT_PUBLIC_YANDEX_MAPS_KEY)
//   * Geocoder HTTP    — coords ⇄ address, and suggestion uri → coords
//   * Suggest HTTP     — as-you-type place suggestions
// Geocoder + Suggest are called straight from the browser (both send
// Access-Control-Allow-Origin: *). Keys are public client keys — restrict them
// by HTTP referrer in the Yandex cabinet, never treat them as secrets.

export const YANDEX_MAPS_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY ?? "";
const GEOCODER_KEY = process.env.NEXT_PUBLIC_YANDEX_GEOCODER_KEY ?? "";
const SUGGEST_KEY = process.env.NEXT_PUBLIC_YANDEX_SUGGEST_KEY ?? "";

const GEOCODE_URL = "https://geocode-maps.yandex.ru/v1/";
const SUGGEST_URL = "https://suggest-maps.yandex.ru/v1/suggest";

// Suggest takes ISO-639-1 ("uz"); the Geocoder takes a locale. uz_UZ is
// accepted by the Geocoder in practice (verified: returns Uzbek toponyms).
const SUGGEST_LANG = "uz";
const GEOCODER_LANG = "uz_UZ";

// Bias toward Bukhara city; span roughly covers Buxoro viloyati.
// Yandex coordinate order is longitude,latitude everywhere.
export const BUKHARA = { lat: 39.767, lng: 64.421 };
const LL = `${BUKHARA.lng},${BUKHARA.lat}`;
const SPN = "1.0,1.0";

export const hasSuggestKey = Boolean(SUGGEST_KEY);
export const hasGeocoderKey = Boolean(GEOCODER_KEY);

export interface Suggestion {
  /** Yandex object uri (exact object) or, failing that, plain text to geocode. */
  id: string;
  primary: string;
  secondary: string;
  /** Best display address (Uzbek, concise) when Yandex provides one. */
  address: string;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Yandex ${res.status}`);
  return res.json();
}

/** Typed text → up to 6 Bukhara-biased suggestions. [] on any failure. */
export async function suggest(query: string): Promise<Suggestion[]> {
  const q = query.trim();
  if (!SUGGEST_KEY || q.length < 2) return [];
  try {
    const url =
      `${SUGGEST_URL}?apikey=${SUGGEST_KEY}&text=${encodeURIComponent(q)}` +
      `&lang=${SUGGEST_LANG}&results=6&ll=${LL}&spn=${SPN}` +
      `&types=geo,biz&print_address=1&attrs=uri`;
    const data = await fetchJson(url);
    const results: any[] = data?.results ?? [];
    return results.slice(0, 6).map((r) => {
      const primary: string = r.title?.text ?? "";
      const secondary: string = r.subtitle?.text ?? "";
      const formatted: string = r.address?.formatted_address ?? "";
      const address =
        formatted || (secondary ? `${primary}, ${secondary}` : primary);
      return {
        id: r.uri ?? address,
        primary,
        secondary: secondary || formatted,
        address,
      };
    });
  } catch {
    return [];
  }
}

export interface GeoResult {
  lat: number;
  lng: number;
  address: string;
}

function firstGeoObject(data: any): any | null {
  return (
    data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject ?? null
  );
}

function toResult(g: any): GeoResult | null {
  const pos: string | undefined = g?.Point?.pos;
  if (!pos) return null;
  const [lng, lat] = pos.split(" ").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address: string =
    g.name || g.metaDataProperty?.GeocoderMetaData?.text || `${lat}, ${lng}`;
  return { lat, lng, address };
}

/** Resolve a suggestion (uri or text) to coordinates. Null on failure. */
export async function resolveSuggestion(id: string): Promise<GeoResult | null> {
  if (!GEOCODER_KEY) return null;
  if (id.includes("://")) {
    try {
      const url =
        `${GEOCODE_URL}?apikey=${GEOCODER_KEY}&uri=${encodeURIComponent(id)}` +
        `&format=json&lang=${GEOCODER_LANG}&results=1`;
      const r = toResult(firstGeoObject(await fetchJson(url)));
      if (r) return r;
    } catch {
      // fall through to a text search
    }
  }
  return forwardGeocode(id);
}

/** Free text → best Bukhara-biased match. Null on failure. */
export async function forwardGeocode(text: string): Promise<GeoResult | null> {
  if (!GEOCODER_KEY || !text.trim()) return null;
  try {
    const url =
      `${GEOCODE_URL}?apikey=${GEOCODER_KEY}&geocode=${encodeURIComponent(text)}` +
      `&ll=${LL}&spn=${SPN}&format=json&lang=${GEOCODER_LANG}&results=1`;
    return toResult(firstGeoObject(await fetchJson(url)));
  } catch {
    return null;
  }
}

/** Coordinates → short address. Falls back to "lat, lng". Never throws. */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  if (!GEOCODER_KEY) return fallback;
  try {
    const url =
      `${GEOCODE_URL}?apikey=${GEOCODER_KEY}&geocode=${lng},${lat}` +
      `&format=json&lang=${GEOCODER_LANG}&results=1`;
    const g = firstGeoObject(await fetchJson(url));
    return g?.name || g?.metaDataProperty?.GeocoderMetaData?.text || fallback;
  } catch {
    return fallback;
  }
}

// ── JS API v3 loader ───────────────────────────────────────────────────────
// Minimal typing for the parts of ymaps3 we use. The full types live in
// @yandex/ymaps3-types; we keep the surface small instead of adding a dep.
export type LngLat = [number, number];
export interface YMaps3 {
  ready: Promise<void>;
  YMap: new (el: HTMLElement, props: { location: { center: LngLat; zoom: number } }) => YMapInstance;
  YMapDefaultSchemeLayer: new (props: Record<string, unknown>) => unknown;
  YMapDefaultFeaturesLayer: new (props: Record<string, unknown>) => unknown;
  YMapMarker: new (props: { coordinates: LngLat }, el: HTMLElement) => YMapChild & {
    update: (props: { coordinates: LngLat }) => void;
  };
  YMapFeature: new (props: {
    geometry: { type: "LineString"; coordinates: LngLat[] };
    style?: { stroke?: { color: string; width: number }[] };
  }) => YMapChild & { update: (props: { geometry: { type: "LineString"; coordinates: LngLat[] } }) => void };
  YMapListener: new (props: {
    layer?: string;
    onClick?: (object: unknown, event: { coordinates: LngLat }) => void;
  }) => YMapChild;
}
export interface YMapChild { }
export interface YMapInstance {
  addChild: (child: unknown) => void;
  removeChild: (child: unknown) => void;
  setLocation: (loc: { center?: LngLat; zoom?: number; duration?: number }) => void;
  destroy: () => void;
}

declare global {
  interface Window {
    ymaps3?: YMaps3;
  }
}

let loader: Promise<YMaps3> | null = null;

/** Injects the JS API script once and resolves when `ymaps3` is ready. */
export function loadYmaps3(): Promise<YMaps3> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (!YANDEX_MAPS_KEY) return Promise.reject(new Error("no-key"));
  if (loader) return loader;
  loader = new Promise<YMaps3>((resolve, reject) => {
    if (window.ymaps3) {
      window.ymaps3.ready.then(() => resolve(window.ymaps3!)).catch(reject);
      return;
    }
    const s = document.createElement("script");
    // Map labels: the JS API has no Uzbek locale; ru_RU is standard for
    // toponyms in Uzbekistan. Address *text* elsewhere stays Uzbek.
    s.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(YANDEX_MAPS_KEY)}&lang=ru_RU`;
    s.async = true;
    s.onload = () => {
      const y = window.ymaps3;
      if (!y) return reject(new Error("ymaps3 missing after load"));
      y.ready.then(() => resolve(y)).catch(reject);
    };
    s.onerror = () => reject(new Error("Yandex Maps script failed to load"));
    document.head.appendChild(s);
  });
  return loader;
}
