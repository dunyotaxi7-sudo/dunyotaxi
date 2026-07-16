import { Platform } from "react-native";

// Resolve the backend base URL.
// - EXPO_PUBLIC_API_URL (from .env) wins — set it to your LAN IP for devices.
// - Otherwise fall back to sensible per-platform localhost aliases so the
//   simulators work out of the box.
const ENV_URL = process.env.EXPO_PUBLIC_API_URL;

function fallbackUrl(): string {
  const port = 8001;
  if (Platform.OS === "android") {
    // Android emulator maps the host machine to 10.0.2.2.
    return `http://10.0.2.2:${port}`;
  }
  // iOS simulator can reach the host via localhost.
  return `http://127.0.0.1:${port}`;
}

export const API_URL = ENV_URL && ENV_URL.length > 0 ? ENV_URL : fallbackUrl();

// WebSocket base (http→ws, https→wss).
export const WS_URL = API_URL.replace(/^http/, "ws");
