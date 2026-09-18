import { useQueryClient } from "@tanstack/react-query";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { parseRideData, registerForPush } from "@/lib/push";
import { useAuth } from "@/store/auth";

// A new-order push (sent to drivers when an order lands on the board) carries
// { type: "new_order" }. Tapping it should open the order board.
function isNewOrder(data: unknown): boolean {
  return (
    !!data &&
    typeof data === "object" &&
    (data as { type?: string }).type === "new_order"
  );
}

// An operator asking a passenger who ordered by phone where they are carries
// { type: "location_request", request_id }. Tapping it opens the consent screen.
function locationRequestId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { type?: string; request_id?: unknown };
  if (d.type !== "location_request") return null;
  return typeof d.request_id === "string" && d.request_id ? d.request_id : null;
}

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
  const qc = useQueryClient();
  const handledColdStart = useRef(false);

  function routeTo(data: unknown) {
    // Driver tapped a new-order notification → open the board.
    if (isNewOrder(data)) {
      router.push("/orders");
      return;
    }
    // Tapped a location request → ask them to share a fix. The consent screen
    // lives in the passenger stack, and an account with a driver profile opens
    // in driver mode by default (defaultMode in the auth store), where that
    // stack is not mounted — navigating straight there would silently do
    // nothing. So park the id, switch modes, and let the effect below navigate
    // once the passenger stack exists.
    const requestId = locationRequestId(data);
    if (requestId) {
      const { mode, setMode, setPendingLocationRequest } = useAuth.getState();
      setPendingLocationRequest(requestId);
      if (mode !== "passenger") void setMode("passenger");
      return;
    }
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

  // A new-order push arriving while the app is open: refresh the board/badge
  // now instead of waiting for the next poll.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notif) => {
      if (isNewOrder(notif.request.content.data)) {
        void qc.invalidateQueries({ queryKey: ["available-orders"] });
      }
    });
    return () => sub.remove();
  }, [qc]);

  // Drains the parked location request as soon as the passenger stack is up.
  // Both stacks mount a PushManager, so this runs in whichever one is showing;
  // the mode check keeps the driver copy from navigating to a route it has no
  // access to.
  const mode = useAuth((s) => s.mode);
  const pendingLocationRequest = useAuth((s) => s.pendingLocationRequest);
  useEffect(() => {
    if (mode !== "passenger" || !pendingLocationRequest) return;
    useAuth.getState().setPendingLocationRequest(null);
    router.push({
      pathname: "/share-location",
      params: { requestId: pendingLocationRequest },
    });
  }, [mode, pendingLocationRequest, router]);

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
