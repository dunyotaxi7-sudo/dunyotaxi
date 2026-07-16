import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { driverApi } from "@/lib/api/driver";
import { apiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { formatDate, formatSom } from "@/lib/format";
import { t } from "@/lib/strings";
import type { DriverRideHistory } from "@/lib/types";
import { colors, radius, spacing } from "@/theme/colors";

export default function DriverHistoryScreen() {
  const router = useRouter();
  const q = useQuery({ queryKey: ["driver-history"], queryFn: () => driverApi.rideHistory() });

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>{t.driver.history.title}</Text>
      </View>

      {q.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : q.isError ? (
        <View style={styles.center}>
          <Text style={styles.err}>{apiError(q.error)}</Text>
          <Button title={t.common.retry} variant="ghost" onPress={() => q.refetch()} />
        </View>
      ) : !q.data || q.data.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🚕</Text>
          <Text style={styles.empty}>{t.driver.history.empty}</Text>
        </View>
      ) : (
        <FlatList
          data={q.data}
          keyExtractor={(r) => r.ride_id}
          contentContainerStyle={{ padding: spacing(5), gap: spacing(3) }}
          renderItem={({ item }) => (
            <Row
              ride={item}
              onPress={() =>
                router.push({ pathname: "/history/[rideId]", params: { rideId: item.ride_id } })
              }
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Row({ ride, onPress }: { ride: DriverRideHistory; onPress: () => void }) {
  const cancelled = ride.status === "cancelled";
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowTop}>
        <Text style={styles.date}>{formatDate(ride.completed_at ?? ride.created_at)}</Text>
        <Text style={[styles.status, cancelled && { color: colors.danger }]}>
          {t.rideStatus[ride.status]}
        </Text>
      </View>
      <Text style={styles.addr} numberOfLines={1}>{ride.from_address}</Text>
      <Text style={styles.addr} numberOfLines={1}>→ {ride.to_address}</Text>
      <View style={styles.rowBottom}>
        <Text style={styles.fare}>{formatSom(ride.price_sum)}</Text>
        {ride.driver_earning != null ? (
          <Text style={styles.earning}>
            {t.driver.history.earning}: {formatSom(ride.driver_earning)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing(4), padding: spacing(5) },
  back: { fontSize: 24, color: colors.text },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing(3) },
  err: { color: colors.danger, fontSize: 14 },
  emptyEmoji: { fontSize: 44 },
  empty: { color: colors.muted, fontSize: 16 },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(4),
    backgroundColor: colors.surface,
    gap: spacing(1),
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing(1) },
  date: { fontSize: 12, color: colors.muted },
  status: { fontSize: 12, color: colors.success, fontWeight: "600" },
  addr: { fontSize: 14, color: colors.text },
  rowBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing(2) },
  fare: { fontSize: 15, fontWeight: "700", color: colors.text },
  earning: { fontSize: 13, color: colors.success, fontWeight: "600" },
});
