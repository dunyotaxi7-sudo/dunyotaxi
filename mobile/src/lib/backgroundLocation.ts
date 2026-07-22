import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { API_URL } from "./config";
import { tokenStorage } from "./storage";

export const DRIVER_LOCATION_TASK = "driver-location-task";

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

  try {
    await fetch(`${API_URL}/driver/location`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access}`,
      },
      body: JSON.stringify({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      }),
    });
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
    timeInterval: 5000,
    distanceInterval: 15,
    // Battery: iOS pauses when stationary and resumes on movement.
    pausesUpdatesAutomatically: true,
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
