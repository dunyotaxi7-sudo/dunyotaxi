// Dynamic Expo config: injects the Google Maps API key from the environment
// (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) instead of hardcoding it in app.json.
// The same variable also drives the JS map fallback (components/Map/index.tsx),
// so one env var configures both the native SDK and the app behavior.
//
// Everything else still lives in app.json; this file only layers the key on top.
const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";

export default ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...(config.android?.config ?? {}),
      // Android needs the key in the manifest; omit entirely when unset.
      ...(KEY ? { googleMaps: { apiKey: KEY } } : {}),
    },
  },
  ios: {
    ...config.ios,
    // iOS uses Apple Maps by default; only set a Google key if provided.
    ...(KEY
      ? { config: { ...(config.ios?.config ?? {}), googleMapsApiKey: KEY } }
      : {}),
  },
});
