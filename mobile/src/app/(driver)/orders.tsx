import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCurrentLocation } from "@/components/Map";
import { AvailableOrdersList } from "@/components/driver/AvailableOrdersList";
import { t } from "@/lib/strings";
import { colors, spacing } from "@/theme/colors";

/**
 * Dedicated full-screen open-order board. Reached from the driver home via the
 * "Buyurtmalar" button while online — gives the order list the whole screen so
 * a flood of orders stays scannable instead of fighting the map for space.
 */
export default function DriverOrdersScreen() {
  const router = useRouter();
  const location = useCurrentLocation();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{t.driver.menu.orders}</Text>
      </View>

      <AvailableOrdersList coords={location.coords} fullScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(4),
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(4),
  },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
});
