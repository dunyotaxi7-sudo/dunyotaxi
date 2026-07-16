import { Linking, Platform } from "react-native";

/** Open the OS navigation app with a driving route to the given point. */
export function openExternalNav(lat: number, lng: number, label?: string) {
  const q = label ? encodeURIComponent(label) : "";
  const url =
    Platform.OS === "ios"
      ? `http://maps.apple.com/?daddr=${lat},${lng}${q ? `&q=${q}` : ""}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  Linking.openURL(url).catch(() => {});
}

export function callPhone(phone: string) {
  Linking.openURL(`tel:${phone}`).catch(() => {});
}
