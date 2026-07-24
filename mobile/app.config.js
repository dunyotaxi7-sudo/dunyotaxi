// Dynamic Expo config: injects the Google Maps API key from the environment
// (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) instead of hardcoding it in app.json.
// The same variable also drives the JS map fallback (components/Map/index.tsx),
// so one env var configures both the native SDK and the app behavior.
//
// Everything else still lives in app.json; this file only layers the key on top.
const { existsSync } = require("fs");

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";
const GOOGLE_SERVICES = "./google-services.json";

export default ({ config }) => ({
  ...config,
  // Yandex MapKit (Lite/free tier) for the map canvas itself. Spike on the
  // yandex-mapkit branch — verifying it builds on RN 0.86 / New Arch before
  // rewriting the <Map> component.
  plugins: [
    ...(config.plugins ?? []),
    ["react-native-yamap-plus", { android_useYandexMapKitLite: true }],
    // Yandex MapKit requires Android 8.0 (API 26); the Expo default is 24.
    ["expo-build-properties", { android: { minSdkVersion: 26 } }],
  ],
  android: {
    ...config.android,
    // FCM credentials — required for push to reach a backgrounded driver.
    // Untracked (it carries the Firebase API key and the repo is public), so
    // builds without it still work; they just can't deliver push.
    ...(existsSync(GOOGLE_SERVICES)
      ? { googleServicesFile: GOOGLE_SERVICES }
      : {}),
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
