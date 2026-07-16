import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { parseRideData, registerForPush } from "@/lib/push";

// Remote push was removed from Expo Go in SDK 53 — calling the notifications
// APIs there throws. This app needs a development build; in Expo Go we simply
// no-op so the app still runs (without push).
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Mounted once inside the authenticated area. Registers this device for push
 * and routes ride notifications to the right screen — whether tapped in the
 * foreground, background, or from a cold start.
 */
export function PushManager() {
  if (isExpoGo) return null; // dev build only
  return <PushManagerInner />;
}

function PushManagerInner() {
  const router = useRouter();
  const handledColdStart = useRef(false);

  function routeTo(data: unknown) {
    const ride = parseRideData(data);
    if (!ride) return;
    const { ride_id, status } = ride;
    if (status === "completed") {
      router.push({ pathname: "/rating/[rideId]", params: { rideId: ride_id } });
    } else if (status === "searching") {
      router.push({ pathname: "/searching/[rideId]", params: { rideId: ride_id } });
    } else if (["accepted", "arrived", "ongoing"].includes(status)) {
      router.push({ pathname: "/ride/[rideId]", params: { rideId: ride_id } });
    }
  }

  // Register for push once.
  useEffect(() => {
    void registerForPush();
  }, []);

  // Taps while the app is running (foreground/background).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      routeTo(resp.notification.request.content.data);
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cold start: app opened by tapping a notification.
  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (lastResponse && !handledColdStart.current) {
      handledColdStart.current = true;
      routeTo(lastResponse.notification.request.content.data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResponse]);

  return null;
}
