import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ridesApi } from "@/lib/api/rides";
import { apiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { formatKm, formatSom } from "@/lib/format";
import { paymentLabel, t } from "@/lib/strings";
import { colors, radius, spacing } from "@/theme/colors";

export default function RatingScreen() {
  const router = useRouter();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");

  const ride = useQuery({
    queryKey: ["ride", rideId],
    queryFn: () => ridesApi.get(rideId),
  });
  const driver = useQuery({
    queryKey: ["ride-driver", rideId],
    queryFn: () => ridesApi.driver(rideId),
  });

  const submit = useMutation({
    mutationFn: () => ridesApi.rate(rideId, score, comment),
    onSuccess: () => router.replace("/"),
  });

  const goHome = () => router.replace("/");

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View style={styles.container}>
        <Text style={styles.title}>{t.rating.title}</Text>

        {/* summary */}
        <View style={styles.card}>
          <Row label={t.rating.driver} value={driver.data?.full_name ?? "…"} />
          <Row label={t.rating.distance} value={formatKm(ride.data?.distance_km)} />
          <Row label={t.rating.price} value={formatSom(ride.data?.price_sum)} />
          <Row label={t.rating.payment} value={paymentLabel(ride.data?.payment_method)} />
        </View>

        {/* stars */}
        <Text style={styles.prompt}>{t.rating.prompt}</Text>
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
          placeholder={t.rating.commentPlaceholder}
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={3}
        />

        {submit.isError ? (
          <Text style={styles.err}>{apiError(submit.error)}</Text>
        ) : null}

        <View style={{ flex: 1 }} />

        <Button
          title={t.rating.submit}
          onPress={() => submit.mutate()}
          loading={submit.isPending}
          disabled={score === 0}
        />
        <Pressable onPress={goHome} style={styles.skip}>
          <Text style={styles.skipText}>{t.rating.skip}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: spacing(6) },
  title: { fontSize: 24, fontWeight: "700", color: colors.text, marginBottom: spacing(5) },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(4),
    backgroundColor: colors.surface,
    gap: spacing(2),
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { fontSize: 14, color: colors.muted },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: "600" },
  prompt: { fontSize: 16, fontWeight: "600", color: colors.text, textAlign: "center", marginTop: spacing(7) },
  stars: { flexDirection: "row", justifyContent: "center", gap: spacing(2), marginTop: spacing(3) },
  star: { fontSize: 44, color: colors.border },
  starOn: { color: "#f5b301" },
  comment: {
    marginTop: spacing(5),
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(3),
    minHeight: 88,
    textAlignVertical: "top",
    fontSize: 15,
    color: colors.text,
  },
  err: { color: colors.danger, fontSize: 13, marginTop: spacing(2) },
  skip: { alignItems: "center", paddingVertical: spacing(3), marginTop: spacing(1) },
  skipText: { color: colors.muted, fontSize: 15 },
});
