import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { driverApi } from "@/lib/api/driver";
import { isNotFound } from "@/lib/api/client";
import { formatKm, formatSom } from "@/lib/format";
import { t } from "@/lib/strings";
import { colors, radius, spacing } from "@/theme/colors";

export default function DriverHistoryDetailScreen() {
  const router = useRouter();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();

  const view = useQuery({
    queryKey: ["driver-ride", rideId],
    queryFn: () => driverApi.rideView(rideId),
  });
  const earning = useQuery({
    queryKey: ["ride-earning", rideId],
    queryFn: () => driverApi.rideEarning(rideId),
    retry: (n, e) => !isNotFound(e) && n < 1, // no earning row for cancelled rides
  });

  const r = view.data;
  const e = earning.data;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{t.driver.history.title}</Text>
      </View>

      {view.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : !r ? (
        <View style={styles.center}><Text style={styles.muted}>{t.common.notFound}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing(5), gap: spacing(4) }}>
          <View style={styles.card}>
            <Text style={styles.addrLabel}>{t.driver.pickup.title}</Text>
            <Text style={styles.addr}>{r.from_address}</Text>
            <View style={styles.sep} />
            <Text style={styles.addrLabel}>{t.driver.trip.destination}</Text>
            <Text style={styles.addr}>{r.to_address}</Text>
          </View>

          <View style={styles.card}>
            <Row label={t.rideStatus[r.status]} value={formatKm(r.distance_km)} />
            <Row label={t.driver.history.fare} value={formatSom(r.price_sum)} />
            {e ? (
              <>
                <Row label={t.driver.summary.commission} value={`− ${formatSom(e.commission_sum)}`} muted />
                <View style={styles.divider} />
                <Row label={t.driver.summary.earning} value={formatSom(e.driver_earning)} strong />
              </>
            ) : null}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, muted && { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowStrong, muted && { color: colors.muted }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing(4), padding: spacing(5) },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 15 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(4),
    backgroundColor: colors.surface,
    gap: spacing(2),
  },
  addrLabel: { fontSize: 12, color: colors.muted },
  addr: { fontSize: 15, color: colors.text, marginTop: 2 },
  sep: { height: 1, backgroundColor: colors.border, marginVertical: spacing(2) },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { fontSize: 14, color: colors.text },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: "600" },
  rowStrong: { fontSize: 18, fontWeight: "800", color: colors.success },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing(1) },
});
