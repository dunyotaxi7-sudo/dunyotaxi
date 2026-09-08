import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { driverApi } from "@/lib/api/driver";
import { formatKm, formatSom } from "@/lib/format";
import { paymentLabel } from "@/lib/strings";
import { colors, radius, spacing } from "@/theme/colors";
import type { AvailableOrder } from "@/lib/types";

// How many orders to show before the driver taps "show more". Keeps a flood of
// 10-15+ orders scannable instead of an endless scroll.
const COLLAPSED_COUNT = 5;

type SortMode = "near" | "fare";

// Deterministic ordering so cards don't jump between 4s polls (a jumping card
// under the thumb = wrong order claimed). ride_id breaks ties stably.
function sortOrders(orders: AvailableOrder[], mode: SortMode): AvailableOrder[] {
  return [...orders].sort((a, b) => {
    if (mode === "fare") {
      const d = (b.price_sum ?? 0) - (a.price_sum ?? 0);
      if (d !== 0) return d;
    } else {
      const d = a.pickup_distance_m - b.pickup_distance_m;
      if (d !== 0) return d;
    }
    return a.ride_id < b.ride_id ? -1 : a.ride_id > b.ride_id ? 1 : 0;
  });
}

/**
 * The open-order board for a driver (marketplace dispatch). Polls the nearby
 * open orders and lets the driver claim one — first tap wins; a lost race just
 * refreshes the list. Ranked (nearest / highest fare), capped, and stably
 * ordered so it stays usable when many orders arrive at once.
 */
export function AvailableOrdersList({
  coords,
  fullScreen = false,
}: {
  coords: { lat: number; lng: number } | null;
  // When true the board fills its parent (dedicated Orders page) instead of
  // rendering as a capped bottom sheet — shows all orders, no "show more".
  fullScreen?: boolean;
}) {
  const router = useRouter();
  const [sortMode, setSortMode] = useState<SortMode>("near");
  const [expanded, setExpanded] = useState(false);

  const orders = useQuery({
    queryKey: ["available-orders"],
    queryFn: () =>
      coords ? driverApi.availableOrders(coords.lat, coords.lng) : Promise.resolve([]),
    enabled: !!coords,
    refetchInterval: 4000,
  });
  const claim = useMutation({
    mutationFn: (rideId: string) => driverApi.claimRide(rideId),
    onSuccess: (_d, rideId) =>
      router.push({ pathname: "/pickup/[rideId]", params: { rideId } }),
    onError: () => {
      void orders.refetch();
      Alert.alert("Buyurtma allaqachon olingan yoki mavjud emas");
    },
  });

  const data = orders.data ?? [];
  const sorted = useMemo(() => sortOrders(data, sortMode), [data, sortMode]);
  // A dedicated page has the room to show everything; the bottom sheet caps.
  const visible = fullScreen || expanded ? sorted : sorted.slice(0, COLLAPSED_COUNT);
  const hiddenCount = sorted.length - visible.length;

  return (
    <View style={[styles.panel, fullScreen && styles.panelFull]}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>
          Yangi buyurtmalar{data.length ? ` · ${data.length} ta` : ""}
        </Text>
        {data.length > 1 && (
          <View style={styles.sortChips}>
            <SortChip
              label="Eng yaqin"
              active={sortMode === "near"}
              onPress={() => setSortMode("near")}
            />
            <SortChip
              label="Eng qimmat"
              active={sortMode === "fare"}
              onPress={() => setSortMode("fare")}
            />
          </View>
        )}
      </View>

      {orders.isLoading ? (
        <ActivityIndicator style={{ marginVertical: spacing(5) }} color={colors.primary} />
      ) : data.length === 0 ? (
        <Text style={styles.empty}>Hozircha yaqiningizda buyurtma yo'q</Text>
      ) : (
        <ScrollView
          style={fullScreen ? { flex: 1 } : { maxHeight: expanded ? 420 : 320 }}
          showsVerticalScrollIndicator={false}
        >
          {visible.map((o) => (
            <View key={o.ride_id} style={styles.card}>
              <View style={styles.rowTop}>
                <Text style={styles.price}>{formatSom(o.price_sum)}</Text>
                <Text style={styles.pickup}>
                  {formatKm(o.pickup_distance_m / 1000)} uzoqlikda
                </Text>
              </View>
              <Text style={styles.addr} numberOfLines={1}>
                <Text style={{ color: colors.primary }}>●</Text> {o.from_address}
              </Text>
              <Text style={styles.addr} numberOfLines={1}>
                <Text style={{ color: colors.danger }}>●</Text> {o.to_address}
              </Text>
              <View style={styles.rowBottom}>
                <Text style={styles.meta}>
                  {o.distance_km != null ? `${formatKm(o.distance_km)} · ` : ""}
                  {paymentLabel(o.payment_method)}
                </Text>
                <Pressable
                  style={styles.acceptBtn}
                  disabled={claim.isPending}
                  onPress={() => claim.mutate(o.ride_id)}
                >
                  <Text style={styles.acceptText}>Qabul qilish</Text>
                </Pressable>
              </View>
            </View>
          ))}

          {hiddenCount > 0 ? (
            <Pressable style={styles.moreBtn} onPress={() => setExpanded(true)}>
              <Text style={styles.moreText}>Yana {hiddenCount} ta ko'rsatish</Text>
            </Pressable>
          ) : expanded && sorted.length > COLLAPSED_COUNT ? (
            <Pressable style={styles.moreBtn} onPress={() => setExpanded(false)}>
              <Text style={styles.moreText}>Yig'ish</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function SortChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing(4),
    paddingTop: spacing(4),
    paddingBottom: spacing(2),
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  panelFull: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: spacing(2),
    shadowOpacity: 0,
    elevation: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing(3),
    gap: spacing(2),
  },
  header: { fontSize: 16, fontWeight: "800", color: colors.text, flexShrink: 1 },
  sortChips: { flexDirection: "row", gap: spacing(1) },
  chip: {
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.muted },
  chipTextActive: { color: "#fff" },
  empty: { fontSize: 14, color: colors.muted, textAlign: "center", marginVertical: spacing(5) },
  moreBtn: {
    paddingVertical: spacing(3),
    alignItems: "center",
    marginBottom: spacing(2),
  },
  moreText: { fontSize: 14, fontWeight: "700", color: colors.primary },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(3),
    marginBottom: spacing(3),
    backgroundColor: colors.surface,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  price: { fontSize: 20, fontWeight: "800", color: colors.text },
  pickup: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  addr: { fontSize: 14, color: colors.text, marginTop: spacing(1) },
  rowBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing(3),
  },
  meta: { fontSize: 13, color: colors.muted, flex: 1 },
  acceptBtn: {
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(2),
  },
  acceptText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
