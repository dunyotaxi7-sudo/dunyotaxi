import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { driverApi } from "@/lib/api/driver";
import { Button } from "@/components/ui/Button";
import { formatSom } from "@/lib/format";
import { t } from "@/lib/strings";
import { colors, radius, spacing } from "@/theme/colors";

export default function DriverSummaryScreen() {
  const router = useRouter();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");

  const earning = useQuery({
    queryKey: ["ride-earning", rideId],
    queryFn: () => driverApi.rideEarning(rideId),
    retry: 2,
  });

  const submit = useMutation({
    mutationFn: () => driverApi.ratePassenger(rideId, score, comment),
    onSuccess: () => router.replace("/"),
  });

  const e = earning.data;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View style={styles.container}>
        <Ionicons
          name="checkmark-circle-outline"
          size={56}
          color={colors.success}
          style={{ alignSelf: "center" }}
        />
        <Text style={styles.title}>{t.driver.summary.title}</Text>

        <View style={styles.card}>
          <Row label={t.driver.summary.fare} value={formatSom(e?.ride_amount)} />
          <Row
            label={`${t.driver.summary.commission}${e ? ` (${Number(e.commission_pct).toFixed(0)}%)` : ""}`}
            value={e ? `− ${formatSom(e.commission_sum)}` : "—"}
            muted
          />
          <View style={styles.divider} />
          <Row label={t.driver.summary.earning} value={formatSom(e?.driver_earning)} strong />
        </View>

        {/* Rate the passenger */}
        <Text style={styles.prompt}>{t.driver.summary.ratePrompt}</Text>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setScore(n)} hitSlop={6}>
              <Text style={[styles.star, n <= score && styles.starOn]}>★</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.comment}
          value={comment}
          onChangeText={setComment}
          placeholder={t.driver.summary.commentPlaceholder}
          placeholderTextColor={colors.muted}
          multiline
        />

        <View style={{ flex: 1 }} />
        <Button
          title={t.driver.summary.submit}
          onPress={() => submit.mutate()}
          loading={submit.isPending}
          disabled={score === 0}
        />
        <Pressable onPress={() => router.replace("/")} style={styles.skip}>
          <Text style={styles.skipText}>{t.driver.summary.skip}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, muted && { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowStrong, muted && { color: colors.muted }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: spacing(6) },
  title: { fontSize: 22, fontWeight: "700", color: colors.text, textAlign: "center", marginTop: spacing(2), marginBottom: spacing(5) },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(4),
    backgroundColor: colors.surface,
    gap: spacing(2),
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { fontSize: 14, color: colors.text },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: "600" },
  rowStrong: { fontSize: 18, fontWeight: "800", color: colors.success },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing(1) },
  prompt: { fontSize: 16, fontWeight: "600", color: colors.text, textAlign: "center", marginTop: spacing(6) },
  stars: { flexDirection: "row", justifyContent: "center", gap: spacing(2), marginTop: spacing(3) },
  star: { fontSize: 40, color: colors.border },
  starOn: { color: "#f5b301" },
  comment: {
    marginTop: spacing(4),
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(3),
    minHeight: 72,
    textAlignVertical: "top",
    fontSize: 15,
    color: colors.text,
  },
  skip: { alignItems: "center", paddingVertical: spacing(3) },
  skipText: { color: colors.muted, fontSize: 15 },
});
