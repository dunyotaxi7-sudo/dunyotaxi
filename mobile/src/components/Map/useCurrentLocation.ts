import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import type { Coords } from "./types";

export type PermissionState =
  | "loading"
  | "granted"
  | "denied"
  | "undetermined";

export interface CurrentLocation {
  coords: Coords | null;
  /** Radius of uncertainty in metres, when the platform reports one. */
  accuracy: number | null;
  status: PermissionState;
  error: string | null;
  /** Re-request permission + refresh the position. */
  refresh: () => Promise<void>;
}

/**
 * Requests foreground location permission (iOS + Android) and returns the
 * device position as provider-agnostic {lat, lng}. Handles the denied case so
 * callers can show a clear message.
 *
 * Pass `watch` to keep the position updating — needed where the UI reacts to
 * the driver moving (e.g. unlocking the waiting meter near the pickup).
 */
export function useCurrentLocation(auto = true, watch = false): CurrentLocation {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [status, setStatus] = useState<PermissionState>(
    auto ? "loading" : "undetermined",
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        setStatus("denied");
        setError("Joylashuvga ruxsat berilmadi.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setAccuracy(pos.coords.accuracy ?? null);
      setStatus("granted");
    } catch {
      setStatus("denied");
      setError("Joylashuvni aniqlab bo'lmadi.");
    }
  }, []);

  useEffect(() => {
    if (auto) void refresh();
  }, [auto, refresh]);

  // Live updates. Only starts once permission is granted, so it never races
  // the permission prompt in `refresh`.
  useEffect(() => {
    if (!watch || status !== "granted") return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const s = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 4000,
            distanceInterval: 10,
          },
          (pos) => {
            setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            setAccuracy(pos.coords.accuracy ?? null);
          },
        );
        if (cancelled) s.remove();
        else sub = s;
      } catch {
        // Keep the last known position; the one-shot fix above still applies.
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [watch, status]);

  return { coords, accuracy, status, error, refresh };
}
