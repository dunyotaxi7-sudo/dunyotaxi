import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { API_URL } from "./config";
import { memoToken, tokenStorage } from "./storage";

export const DRIVER_LOCATION_TASK = "driver-location-task";

function postFix(token: string, lat: number, lng: number): Promise<Response> {
  return fetch(`${API_URL}/driver/location`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ lat, lng }),
  });
}

// One in-flight refresh at a time — fixes arrive every ~5s and would otherwise
// each kick off their own. After a failure, back off before trying again rather
// than hammering /auth/refresh twelve times a minute.
const REFRESH_BACKOFF_MS = 60_000;
let refreshing: Promise<string | null> | null = null;
let refreshFailedAt = 0;

/**
 * Swap the refresh token for a new access token, from inside the task.
 *
 * The task runs in its own headless JS context, so the axios client's refresh
 * interceptor and its in-memory token are out of reach here. /auth/refresh is
 * stateless and does not invalidate the old refresh token, so this racing with
 * the main app's own refresh is harmless — both end up with a valid pair.
 */
async function refreshAccess(): Promise<string | null> {
  if (Date.now() - refreshFailedAt < REFRESH_BACKOFF_MS) return null;
  refreshing =
    refreshing ??
    (async () => {
      try {
        const { refresh } = await tokenStorage.get();
        if (!refresh) return null;
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        if (!res.ok) {
          // Refresh expired or the driver was blocked. Nothing to do from a
          // background task; the app signs them out next time it is opened.
          refreshFailedAt = Date.now();
          return null;
        }
        const data = await res.json();
        await tokenStorage.set(data.access_token, data.refresh_token);
        memoToken.set(data.access_token);
        refreshFailedAt = 0;
        return data.access_token as string;
      } catch {
        refreshFailedAt = Date.now();
        return null;
      } finally {
        refreshing = null;
      }
    })();
  return refreshing;
}

// Defined at module import so the OS can invoke it even after the app is
// backgrounded. Sends the latest fix to the backend over HTTP (a WebSocket
// can't be relied on in the background).
TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] })?.locations;
  const loc = locations?.[locations.length - 1];
  if (!loc) return;

  // Read the token from SecureStore (the in-memory copy may be gone if the app
  // was killed and the task relaunched headless).
  const { access } = await tokenStorage.get();
  if (!access) return;

  const { latitude: lat, longitude: lng } = loc.coords;
  try {
    const res = await postFix(access, lat, lng);
    // An access token lasts an hour; a driver's shift is longer. Without this
    // the expiry silently ended their shift as far as dispatch was concerned —
    // the app still said "Siz onlaynsiz" and still burned GPS, but every fix
    // was rejected, the freshness key lapsed, and no order could reach them
    // until they happened to open the app.
    if (res.status === 401) {
      const fresh = await refreshAccess();
      if (fresh) await postFix(fresh, lat, lng);
    }
  } catch {
    // best-effort; the next fix will retry
  }
});

/** Why streaming couldn't start — the caller needs this to offer the right fix. */
export type LocationStart =
  | { ok: true }
  /** Device location services are switched off entirely. */
  | { ok: false; reason: "services-off" }
  /** Denied, but the OS will still show the prompt next time we ask. */
  | { ok: false; reason: "denied" }
  /** Denied permanently — only the Settings app can grant it now. */
  | { ok: false; reason: "blocked" };

/**
 * Start streaming the driver's location (foreground + background). Requests
 * foreground and background permission; on Android runs a foreground service
 * with a persistent "Siz onlaynsiz" notification (required by the OS).
 *
 * Distinguishes the failure modes because they need different fixes: services
 * off needs the system location toggle, a permanent denial needs the app's
 * settings page, and a plain denial just needs asking again next tap.
 */
export async function startBackgroundLocation(): Promise<LocationStart> {
  // GPS switched off system-wide: permission could be granted and we'd still
  // never get a fix, so check it before asking for anything.
  const servicesOn = await Location.hasServicesEnabledAsync().catch(() => true);
  if (!servicesOn) return { ok: false, reason: "services-off" };

  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) {
    return { ok: false, reason: fg.canAskAgain ? "denied" : "blocked" };
  }
  // Background permission may be denied — foreground service still works while
  // the app is open; we don't hard-fail on it.
  await Location.requestBackgroundPermissionsAsync().catch(() => undefined);

  const already = await Location.hasStartedLocationUpdatesAsync(
    DRIVER_LOCATION_TASK,
  ).catch(() => false);
  if (already) return { ok: true };

  await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    // A heartbeat, not just a movement report. distanceInterval was 15 m,
    // which meant a parked car emitted nothing at all — and a driver waiting
    // for work is, by definition, parked. Their last position went stale after
    // the server's 120-second window and they dropped out of the dispatch
    // pool: still "Onlayn" on their phone, invisible to every order. 0 removes
    // the distance filter so the interval alone governs.
    timeInterval: 10000,
    distanceInterval: 0,
    // Was true, which lets iOS pause updates when it decides the device is
    // stationary — the same silence, for the same drivers. A taxi waiting at a
    // rank must keep reporting precisely because it is not moving.
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: false,
    foregroundService: {
      notificationTitle: "Siz onlaynsiz",
      notificationBody: "Dunyo Taxi joylashuvingizni kuzatmoqda",
      notificationColor: "#2563eb",
    },
  });
  return { ok: true };
}

export async function stopBackgroundLocation(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(
    DRIVER_LOCATION_TASK,
  ).catch(() => false);
  if (started) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(
      () => undefined,
    );
  }
}
