import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
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

/**
 * The open-order board for a driver (marketplace dispatch). Polls the nearby
 * open orders and lets the driver claim one — first tap wins; a lost race just
 * refreshes the list.
 */
export function AvailableOrdersList({
  coords,
}: {
  coords: { lat: number; lng: number } | null;
}) {
  const router = useRouter();
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

  return (
    <View style={styles.panel}>
      <Text style={styles.header}>
        Yangi buyurtmalar{data.length ? ` (${data.length})` : ""}
      </Text>
      {orders.isLoading ? (
        <ActivityIndicator style={{ marginVertical: spacing(5) }} color={colors.primary} />
      ) : data.length === 0 ? (
        <Text style={styles.empty}>Hozircha yaqiningizda buyurtma yo'q</Text>
      ) : (
        <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
          {data.map((o) => (
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
        </ScrollView>
      )}
    </View>
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
  header: { fontSize: 16, fontWeight: "800", color: colors.text, marginBottom: spacing(3) },
  empty: { fontSize: 14, color: colors.muted, textAlign: "center", marginVertical: spacing(5) },
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
