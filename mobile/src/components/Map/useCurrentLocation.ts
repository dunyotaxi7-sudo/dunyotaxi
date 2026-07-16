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
  status: PermissionState;
  error: string | null;
  /** Re-request permission + refresh the position. */
  refresh: () => Promise<void>;
}

/**
 * Requests foreground location permission (iOS + Android) and returns the
 * device position as provider-agnostic {lat, lng}. Handles the denied case so
 * callers can show a clear message.
 */
export function useCurrentLocation(auto = true): CurrentLocation {
  const [coords, setCoords] = useState<Coords | null>(null);
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
      setStatus("granted");
    } catch {
      setStatus("denied");
      setError("Joylashuvni aniqlab bo'lmadi.");
    }
  }, []);

  useEffect(() => {
    if (auto) void refresh();
  }, [auto, refresh]);

  return { coords, status, error, refresh };
}
