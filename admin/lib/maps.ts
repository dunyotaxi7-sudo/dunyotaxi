// Shared Google Maps JS loader config. Every useJsApiLoader call MUST pass the
// same id + libraries, or @react-google-maps/api warns and reloads the script.
import type { Libraries } from "@react-google-maps/api";

export const GOOGLE_MAPS_ID = "bukhara-google-maps";
// Module-level constant so the array identity stays stable across renders.
export const GOOGLE_MAPS_LIBRARIES: Libraries = ["places"];
export const GOOGLE_MAPS_API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
// "uz" (O'zbekcha) by default; set NEXT_PUBLIC_MAPS_LANGUAGE=ru for Russian.
export const MAPS_LANGUAGE = process.env.NEXT_PUBLIC_MAPS_LANGUAGE || "uz";

export const BUKHARA_CENTER = { lat: 39.767, lng: 64.421 };
export const BUKHARA_BIAS_RADIUS_M = 120_000;
