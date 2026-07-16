import { useNetworkState } from "expo-network";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "@/lib/strings";
import { colors, spacing } from "@/theme/colors";

/**
 * App-wide persistent banner shown while the device is offline. Mounted once at
 * the root so every screen surfaces the state; actions that need the network
 * fail through the API client's error handling.
 */
export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const net = useNetworkState();

  // `undefined` while resolving — only treat an explicit false as offline.
  const offline =
    net.isConnected === false || net.isInternetReachable === false;
  if (!offline) return null;

  return (
    <View style={[styles.banner, { paddingTop: insets.top + spacing(2) }]}>
      <Text style={styles.text}>{t.offline}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: colors.danger,
    paddingBottom: spacing(2),
    paddingHorizontal: spacing(4),
    alignItems: "center",
  },
  text: { color: "#fff", fontSize: 13, fontWeight: "500" },
});
