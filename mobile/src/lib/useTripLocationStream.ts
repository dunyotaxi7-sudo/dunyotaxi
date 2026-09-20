import * as Location from "expo-location";
import { useEffect } from "react";
import { driverApi } from "@/lib/api/driver";

/**
 * Streams the driver's position to the server while a trip is on screen.
 *
 * Until now the only sender was the background task, which starts only if the
 * driver accepted the background-location disclosure AND granted "Allow all
 * the time". A driver who declined drove whole metered trips while the server
 * received nothing: the distance meter measured 0.00 km and the passenger was
 * charged the minimum fare.
 *
 * Foreground location needs no special permission beyond the one the app
 * already requires, so with the trip open in front of the driver this always
 * works. It does not replace the background task — that is what keeps the
 * stream alive once the phone is pocketed — it removes the single point of
 * failure underneath the fare.
 */
export function useTripLocationStream(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    void (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted || cancelled) return;
      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          // Matches the background task's cadence, so the server's speed
          // sanity-check sees the same kind of gaps either way.
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (pos) => {
          // Fire and forget: a dropped fix is not worth interrupting a trip.
          void driverApi
            .sendLocation(pos.coords.latitude, pos.coords.longitude)
            .catch(() => {});
        },
      );
      if (cancelled) sub.remove();
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);
}
