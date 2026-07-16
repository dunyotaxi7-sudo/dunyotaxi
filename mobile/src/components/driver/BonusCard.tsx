import { StyleSheet, Text, View } from "react-native";
import { formatSom } from "@/lib/format";
import { t } from "@/lib/strings";
import type { DriverBonus } from "@/lib/types";
import { colors, radius, spacing } from "@/theme/colors";

export function BonusCard({ bonus }: { bonus: DriverBonus }) {
  const target = bonus.target_value ?? 0;
  const pct = target > 0 ? Math.min(100, (bonus.progress / target) * 100) : 0;

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.name}>{bonus.name}</Text>
        {bonus.bonus_amount ? (
          <Text style={styles.reward}>{formatSom(bonus.bonus_amount)}</Text>
        ) : null}
      </View>
      {bonus.description ? (
        <Text style={styles.desc} numberOfLines={2}>{bonus.description}</Text>
      ) : null}

      {target > 0 ? (
        <>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${pct}%` }]} />
          </View>
          <Text style={styles.progress}>
            {bonus.is_completed
              ? t.driver.bonus.completed
              : t.driver.bonus.progress(bonus.progress, target)}
          </Text>
        </>
      ) : bonus.is_completed ? (
        <Text style={styles.progress}>{t.driver.bonus.completed}</Text>
      ) : null}
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
  },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 15, fontWeight: "700", color: colors.text, flex: 1 },
  reward: { fontSize: 14, fontWeight: "700", color: colors.success },
  desc: { fontSize: 13, color: colors.muted, marginTop: spacing(1), lineHeight: 18 },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    marginTop: spacing(3),
    overflow: "hidden",
  },
  barFill: { height: 8, backgroundColor: colors.primary, borderRadius: 4 },
  progress: { fontSize: 12, color: colors.muted, marginTop: spacing(2) },
});
