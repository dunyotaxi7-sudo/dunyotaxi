import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { driverApi } from "@/lib/api/driver";
import { formatKm, formatSom } from "@/lib/format";
import { paymentLabel, t } from "@/lib/strings";
import type { RideOffer } from "@/lib/ws/useLocationStreaming";
import { colors, radius, spacing } from "@/theme/colors";

export function RideOfferModal({
  offer,
  onClose,
}: {
  offer: RideOffer;
  onClose: () => void;
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(offer.timeout_s);
  const closedRef = useRef(false);

  const details = useQuery({
    queryKey: ["ride-offer", offer.ride_id],
    queryFn: () => driverApi.offerDetails(offer.ride_id),
    retry: false,
  });

  // Alert the driver on arrival.
  useEffect(() => {
    Vibration.vibrate([0, 400, 250, 400], true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    return () => Vibration.cancel();
  }, []);

  const accept = useMutation({
    mutationFn: () => driverApi.acceptRide(offer.ride_id),
    onSuccess: () => {
      finish();
      router.push({ pathname: "/pickup/[rideId]", params: { rideId: offer.ride_id } });
    },
    onError: () => finish(), // offer likely expired / taken
  });

  const reject = useMutation({
    mutationFn: () => driverApi.rejectRide(offer.ride_id),
    onSettled: () => finish(),
  });

  function finish() {
    if (closedRef.current) return;
    closedRef.current = true;
    Vibration.cancel();
    onClose();
  }

  // Countdown → auto-reject at 0.
  useEffect(() => {
    if (remaining <= 0) {
      driverApi.rejectRide(offer.ride_id).catch(() => {});
      finish();
      return;
    }
    const id = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  const pct = Math.max(0, (remaining / offer.timeout_s) * 100);
  const urgent = remaining <= 5;
  const d = details.data;

  return (
    <Modal visible animationType="slide" transparent={false}>
      <SafeAreaView style={styles.root}>
        {/* Countdown */}
        <View style={styles.header}>
          <Text style={styles.title}>{t.driver.offer.title}</Text>
          <View style={[styles.timer, urgent && styles.timerUrgent]}>
            <Text style={[styles.timerText, urgent && styles.timerTextUrgent]}>
              {remaining}
            </Text>
          </View>
        </View>
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              { width: `${pct}%` },
              urgent && styles.barFillUrgent,
            ]}
          />
        </View>

        {details.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : d ? (
          <View style={styles.body}>
            <View style={styles.route}>
              <PlaceRow color={colors.primary} label={t.driver.offer.from} value={d.from_address} />
              <View style={styles.routeLine} />
              <PlaceRow color={colors.danger} label={t.driver.offer.to} value={d.to_address} />
            </View>

            <View style={styles.metrics}>
              <Metric label={t.driver.offer.distance} value={formatKm(d.distance_km)} />
              <Metric label={t.driver.offer.fare} value={formatSom(d.price_sum)} big />
              <Metric
                label={t.driver.offer.passenger}
                value={d.passenger_rating != null ? `★ ${d.passenger_rating.toFixed(1)}` : "★ —"}
              />
            </View>
            <View style={styles.payBadge}>
              <Text style={styles.payBadgeText}>
                💵 {paymentLabel(d.payment_method)}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.loading}>
            <Text style={styles.muted}>{t.driver.offer.expired}</Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            style={[styles.btn, styles.reject]}
            onPress={() => reject.mutate()}
            disabled={reject.isPending || accept.isPending}
          >
            <Text style={[styles.btnText, { color: colors.danger }]}>
              {t.driver.offer.reject}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.accept]}
            onPress={() => accept.mutate()}
            disabled={accept.isPending || reject.isPending}
          >
            {accept.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.btnText, { color: "#fff" }]}>
                {t.driver.offer.accept}
              </Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function PlaceRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={styles.placeRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.placeLabel}>{label}</Text>
        <Text style={styles.placeValue} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

function Metric({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, big && styles.metricBig]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: spacing(6) },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 24, fontWeight: "800", color: colors.text },
  timer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  timerText: { fontSize: 20, fontWeight: "800", color: colors.primary },
  timerUrgent: { borderColor: colors.danger },
  timerTextUrgent: { color: colors.danger },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border, marginTop: spacing(4), overflow: "hidden" },
  barFill: { height: 6, backgroundColor: colors.primary },
  barFillUrgent: { backgroundColor: colors.danger },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 16 },
  body: { flex: 1, marginTop: spacing(6) },
  route: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(4),
    backgroundColor: colors.surface,
  },
  placeRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing(3) },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  routeLine: { height: 1, backgroundColor: colors.border, marginVertical: spacing(3), marginLeft: spacing(6) },
  placeLabel: { fontSize: 12, color: colors.muted },
  placeValue: { fontSize: 16, color: colors.text, marginTop: 2 },
  metrics: {
    flexDirection: "row",
    marginTop: spacing(6),
    justifyContent: "space-between",
  },
  metric: { alignItems: "center", flex: 1 },
  metricValue: { fontSize: 18, fontWeight: "700", color: colors.text },
  metricBig: { fontSize: 24, color: colors.primary },
  metricLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },
  payBadge: {
    alignSelf: "center",
    marginTop: spacing(5),
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(4),
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  payBadgeText: { fontSize: 15, fontWeight: "600", color: colors.text },
  actions: { flexDirection: "row", gap: spacing(3) },
  btn: { flex: 1, height: 58, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  reject: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.danger },
  accept: { backgroundColor: colors.success },
  btnText: { fontSize: 17, fontWeight: "700" },
});
