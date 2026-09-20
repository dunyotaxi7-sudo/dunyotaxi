import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ridesApi } from "@/lib/api/rides";
import { formatSom } from "@/lib/format";
import { t } from "@/lib/strings";
import { colors, radius, spacing } from "@/theme/colors";

/**
 * The taximeter a driver watches during a metered trip.
 *
 * The figures come from the server, not from the phone: the same snapshot that
 * settles the fare at the end. A driver watching one number climb and being
 * paid on another would look like the app cheating them, so there is exactly
 * one calculation and both ends read it.
 */
export function TripMeter({ rideId, active }: { rideId: string; active: boolean }) {
  const meter = useQuery({
    queryKey: ["ride-meter", rideId],
    queryFn: () => ridesApi.meter(rideId),
    enabled: active,
    // GPS arrives about every 5s; polling faster would only show the same
    // number twice.
    refetchInterval: 5000,
  });

  const km = meter.data ? Number(meter.data.km) : null;
  const waiting = km === null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.liveDot} />
        <Text style={styles.header}>{t.driver.trip.meterTitle}</Text>
      </View>

      <View style={styles.readings}>
        <View style={styles.reading}>
          <Text style={styles.value}>
            {waiting ? "—" : km.toFixed(2)}
            <Text style={styles.unit}> km</Text>
          </Text>
          <Text style={styles.label}>{t.driver.trip.meterDistance}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.reading}>
          <Text style={[styles.value, styles.money]}>
            {waiting ? "—" : formatSom(meter.data?.price_sum)}
          </Text>
          <Text style={styles.label}>{t.driver.trip.meterFare}</Text>
        </View>
      </View>

      {meter.isError ? (
        <Text style={styles.warn}>{t.driver.trip.meterOffline}</Text>
      ) : km === 0 ? (
        // Zero after a while means no GPS is reaching the server — the fare
        // would settle at the minimum. Say so while it can still be fixed.
        <Text style={styles.hint}>{t.driver.trip.meterZero}</Text>
      ) : waiting ? (
        <View style={styles.hintRow}>
          <ActivityIndicator size="small" color={colors.muted} />
          <Text style={styles.hint}>{t.driver.trip.meterWaiting}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
    gap: spacing(3),
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  header: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  readings: { flexDirection: "row", alignItems: "center" },
  reading: { flex: 1, alignItems: "center" },
  divider: { width: 1, alignSelf: "stretch", backgroundColor: colors.border },
  value: { fontSize: 30, fontWeight: "800", color: colors.text },
  money: { color: colors.primary },
  unit: { fontSize: 15, fontWeight: "600", color: colors.muted },
  label: { fontSize: 12, color: colors.muted, marginTop: spacing(1) },
  hintRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  hint: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  warn: { fontSize: 12, color: colors.danger },
});
