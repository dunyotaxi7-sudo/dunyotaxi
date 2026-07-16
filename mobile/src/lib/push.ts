import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api/client";

// Expo Go (SDK 53+) can't do remote push — the APIs throw. Requires a dev build.
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// How notifications behave while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export interface RideNotificationData {
  type: "ride";
  ride_id: string;
  status: string;
}

export function parseRideData(
  data: unknown,
): RideNotificationData | null {
  if (
    data &&
    typeof data === "object" &&
    (data as { type?: string }).type === "ride" &&
    typeof (data as { ride_id?: string }).ride_id === "string"
  ) {
    return data as RideNotificationData;
  }
  return null;
}

function resolveProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined
  );
}

/**
 * Requests permission (call this after login, not on cold launch), obtains the
 * Expo push token and registers it with the backend. Returns the token or null
 * if unavailable (simulator, denied, or no EAS project configured).
 */
export async function registerForPush(): Promise<string | null> {
  if (isExpoGo) return null; // needs a development build, not Expo Go
  if (!Device.isDevice) return null; // remote push doesn't work on simulators

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Umumiy",
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return null;

  try {
    const projectId = resolveProjectId();
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    await api.post("/notifications/register-token", { token });
    return token;
  } catch (err) {
    // Without an EAS projectId (dev build not linked to EAS) this can throw.
    console.warn("[push] token registration skipped:", err);
    return null;
  }
}
