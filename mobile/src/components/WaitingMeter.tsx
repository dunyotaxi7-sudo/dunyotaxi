import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ridesApi } from "@/lib/api/rides";
import { formatSom } from "@/lib/format";
import { colors, radius, spacing } from "@/theme/colors";

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Waiting-time meter. Server-timed: `waitingSeconds` is the accumulated total
 * and `waitingStartedAt` (ISO) is set while the meter is running. The live
 * elapsed + charge are computed locally so they tick every second without
 * hitting the server. Pass `onToggle` for the driver (adds the Start/Stop
 * button); omit it for a read-only passenger view.
 */
export function WaitingMeter({
  waitingSeconds,
  waitingStartedAt,
  onToggle,
  pending,
}: {
  waitingSeconds: number;
  waitingStartedAt: string | null;
  onToggle?: () => void;
  pending?: boolean;
}) {
  const rate = useQuery({
    queryKey: ["waiting-rate"],
    queryFn: () => ridesApi.waitingRate(),
    staleTime: 5 * 60 * 1000,
  });
  const free = rate.data?.wait_free_minutes ?? 3;
  const perMin = rate.data?.wait_per_minute ?? 1000;

  const active = Boolean(waitingStartedAt);
  // Re-render every second while running to advance the live timer/charge.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);

  const runningExtra = active
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(waitingStartedAt!).getTime()) / 1000),
      )
    : 0;
  const total = (waitingSeconds || 0) + runningExtra;
  const billableMin = Math.max(0, Math.ceil(total / 60) - free);
  const charge = billableMin * perMin;

  // Passenger view: don't show anything until there's something to show.
  if (!onToggle && !active && total === 0) return null;

  return (
    <View style={[styles.card, active && styles.cardActive]}>
      <View style={styles.row}>
        <View>
          <Text style={styles.label}>
            {active ? "Kutilmoqda…" : "Kutish vaqti"}
          </Text>
          <Text style={[styles.timer, active && styles.timerActive]}>
            {mmss(total)}
          </Text>
        </View>
        <View style={styles.chargeBox}>
          <Text style={styles.chargeLabel}>Kutish haqi</Text>
          <Text style={[styles.charge, charge > 0 && styles.chargeOn]}>
            {charge > 0 ? `+${formatSom(charge)}` : "Bepul"}
          </Text>
        </View>
      </View>
      <Text style={styles.hint}>
        Birinchi {free} daqiqa bepul · keyin {formatSom(perMin)}/daqiqa
      </Text>
      {onToggle && (
        <Pressable
          style={[styles.btn, active ? styles.stop : styles.start]}
          onPress={onToggle}
          disabled={pending}
        >
          {pending ? (
            <ActivityIndicator color={active ? colors.danger : "#fff"} />
          ) : (
            <Text style={[styles.btnText, active && styles.stopText]}>
              {active ? "Kutishni to'xtatish" : "Kutishni boshlash"}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(4),
    backgroundColor: colors.surface,
    gap: spacing(2),
  },
  cardActive: { borderColor: colors.primary, backgroundColor: "#eef4ff" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontSize: 12, color: colors.muted },
  timer: { fontSize: 28, fontWeight: "800", color: colors.text, fontVariant: ["tabular-nums"] },
  timerActive: { color: colors.primary },
  chargeBox: { alignItems: "flex-end" },
  chargeLabel: { fontSize: 12, color: colors.muted },
  charge: { fontSize: 18, fontWeight: "700", color: colors.muted },
  chargeOn: { color: colors.danger },
  hint: { fontSize: 12, color: colors.muted },
  btn: {
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing(1),
  },
  start: { backgroundColor: colors.primary },
  stop: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.danger },
  btnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  stopText: { color: colors.danger },
});
