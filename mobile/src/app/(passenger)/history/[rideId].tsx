import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ridesApi } from "@/lib/api/rides";
import { formatDate, formatKm, formatSom } from "@/lib/format";
import { paymentLabel, t } from "@/lib/strings";
import { colors, radius, spacing } from "@/theme/colors";

export default function HistoryDetailScreen() {
  const router = useRouter();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const ride = useQuery({
    queryKey: ["ride", rideId],
    queryFn: () => ridesApi.get(rideId),
  });

  const r = ride.data;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>{t.history.detailTitle}</Text>
      </View>

      {ride.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !r ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{t.common.notFound}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing(5), gap: spacing(4) }}>
          <View style={styles.route}>
            <Text style={styles.addrLabel}>{t.history.from}</Text>
            <Text style={styles.addr}>{r.from_address}</Text>
            <View style={styles.sep} />
            <Text style={styles.addrLabel}>{t.history.to}</Text>
            <Text style={styles.addr}>{r.to_address}</Text>
          </View>

          <View style={styles.card}>
            <Row label={t.history.status} value={t.rideStatus[r.status]} />
            <Row label={t.history.date} value={formatDate(r.created_at)} />
            <Row label={t.history.distance} value={formatKm(r.distance_km)} />
            <Row label={t.history.price} value={formatSom(r.price_sum)} />
            <Row label={t.history.payment} value={paymentLabel(r.payment_method)} />
            {r.status === "cancelled" && r.cancel_reason ? (
              <Row label={t.history.cancelReason} value={r.cancel_reason} />
            ) : null}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing(4), padding: spacing(5) },
  back: { fontSize: 24, color: colors.text },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 15 },
  route: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(4),
    backgroundColor: colors.surface,
  },
  addrLabel: { fontSize: 12, color: colors.muted },
  addr: { fontSize: 15, color: colors.text, marginTop: 2 },
  sep: { height: 1, backgroundColor: colors.border, marginVertical: spacing(3) },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(4),
    gap: spacing(3),
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { fontSize: 14, color: colors.muted },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: "600", flexShrink: 1, textAlign: "right" },
});
