import { Linking } from "react-native";

// Yandex is what drivers here actually use, so route to it rather than Google
// or Apple Maps. Try the dedicated navigator first, then Yandex Maps, then the
// web map — whichever the driver has installed wins.
//
// Deliberately no canOpenURL(): on Android 11+ it returns false for any scheme
// not declared in the manifest's <queries>, so it would report "not installed"
// for apps that are. openURL rejects when nothing handles the scheme, which
// gives us the same signal without the manifest coupling.
const navUrls = (lat: number, lng: number) => [
  `yandexnavi://build_route_on_map?lat_to=${lat}&lon_to=${lng}`,
  `yandexmaps://maps.yandex.ru/?rtext=~${lat},${lng}&rtt=auto`,
  `https://yandex.uz/maps/?rtext=~${lat},${lng}&rtt=auto`,
];

/** Open a driving route to the given point in Yandex Navigator / Maps. */
export async function openExternalNav(lat: number, lng: number) {
  for (const url of navUrls(lat, lng)) {
    try {
      await Linking.openURL(url);
      return;
    } catch {
      // Not installed — fall through to the next option.
    }
  }
}

export function callPhone(phone: string) {
  Linking.openURL(`tel:${phone}`).catch(() => {});
}
