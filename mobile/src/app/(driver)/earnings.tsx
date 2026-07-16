import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { driverApi } from "@/lib/api/driver";
import { apiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { BarChart } from "@/components/driver/BarChart";
import { BonusCard } from "@/components/driver/BonusCard";
import { formatSom } from "@/lib/format";
import { t } from "@/lib/strings";
import { colors, radius, spacing } from "@/theme/colors";

export default function DriverEarningsScreen() {
  const router = useRouter();
  const q = useQuery({ queryKey: ["driver-earnings"], queryFn: () => driverApi.earnings() });
  const bonuses = useQuery({ queryKey: ["driver-bonuses"], queryFn: () => driverApi.bonuses() });

  const chart =
    q.data?.daily.map((d) => ({
      label: new Date(d.day).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      value: d.earning,
    })) ?? [];

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>{t.driver.earnings.title}</Text>
      </View>

      {q.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : q.isError ? (
        <View style={styles.center}>
          <Text style={styles.err}>{apiError(q.error)}</Text>
          <Button title={t.common.retry} variant="ghost" onPress={() => q.refetch()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing(5), gap: spacing(4) }}>
          <View style={styles.stats}>
            <Stat label={t.driver.earnings.today} value={formatSom(q.data?.today_sum)} />
            <Stat label={t.driver.earnings.week} value={formatSom(q.data?.week_sum)} />
            <Stat label={t.driver.earnings.month} value={formatSom(q.data?.month_sum)} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t.driver.earnings.chartTitle}</Text>
            {chart.length === 0 ? (
              <Text style={styles.empty}>{t.driver.earnings.empty}</Text>
            ) : (
              <BarChart data={chart} />
            )}
          </View>

          {/* Bonuses */}
          <Text style={styles.section}>{t.driver.bonus.title}</Text>
          {bonuses.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : !bonuses.data || bonuses.data.length === 0 ? (
            <Text style={styles.empty}>{t.driver.bonus.empty}</Text>
          ) : (
            <View style={{ gap: spacing(3) }}>
              {bonuses.data.map((b) => (
                <BonusCard key={b.campaign_id} bonus={b} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing(4), padding: spacing(5) },
  back: { fontSize: 24, color: colors.text },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing(3) },
  err: { color: colors.danger, fontSize: 14 },
  stats: { flexDirection: "row", gap: spacing(3) },
  stat: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(3),
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  statValue: { fontSize: 16, fontWeight: "700", color: colors.text },
  statLabel: { fontSize: 12, color: colors.muted, marginTop: 4 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(4),
    backgroundColor: colors.surface,
  },
  cardTitle: { fontSize: 15, fontWeight: "600", color: colors.text, marginBottom: spacing(4) },
  section: { fontSize: 15, fontWeight: "600", color: colors.text, marginTop: spacing(2) },
  empty: { color: colors.muted, fontSize: 14, textAlign: "center", paddingVertical: spacing(6) },
});
