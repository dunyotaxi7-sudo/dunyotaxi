import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ridesApi } from "@/lib/api/rides";
import { apiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { formatDate, formatSom } from "@/lib/format";
import { t } from "@/lib/strings";
import type { RidePublic } from "@/lib/types";
import { colors, radius, spacing } from "@/theme/colors";

export default function HistoryScreen() {
  const router = useRouter();
  const rides = useQuery({
    queryKey: ["my-rides"],
    queryFn: () => ridesApi.mine(),
  });

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>{t.history.title}</Text>
      </View>

      {rides.isLoading ? (
        <View style={{ padding: spacing(5), gap: spacing(3) }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : rides.isError ? (
        <View style={styles.center}>
          <Text style={styles.err}>{apiError(rides.error)}</Text>
          <Button title={t.common.retry} variant="ghost" onPress={() => rides.refetch()} />
        </View>
      ) : !rides.data || rides.data.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🚕</Text>
          <Text style={styles.empty}>{t.history.empty}</Text>
        </View>
      ) : (
        <FlatList
          data={rides.data}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: spacing(5), gap: spacing(3) }}
          renderItem={({ item }) => <HistoryRow ride={item} onPress={() =>
            router.push({ pathname: "/history/[rideId]", params: { rideId: item.id } })
          } />}
        />
      )}
    </SafeAreaView>
  );
}

function HistoryRow({ ride, onPress }: { ride: RidePublic; onPress: () => void }) {
  const cancelled = ride.status === "cancelled";
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowTop}>
        <Text style={styles.date}>{formatDate(ride.created_at)}</Text>
        <Text style={[styles.status, cancelled && styles.statusCancelled]}>
          {t.rideStatus[ride.status]}
        </Text>
      </View>
      <Text style={styles.addr} numberOfLines={1}>{ride.from_address}</Text>
      <Text style={styles.addr} numberOfLines={1}>→ {ride.to_address}</Text>
      <Text style={styles.price}>{formatSom(ride.price_sum)}</Text>
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
  statusCancelled: { color: colors.danger },
  addr: { fontSize: 14, color: colors.text },
  price: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: spacing(2) },
});
