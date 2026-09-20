import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { apiError } from "@/lib/api/client";
import { ridesApi } from "@/lib/api/rides";
import { formatSom } from "@/lib/format";
import { t } from "@/lib/strings";
import { useRideDraft } from "@/store/ride";
import { colors, radius, spacing } from "@/theme/colors";

/**
 * Ordering without a destination — "just drive, I'll direct him".
 *
 * Deliberately a separate screen from the estimate: there is no price to
 * estimate, and dressing one up would be worse than honest. Instead the
 * passenger is shown the tariff the fare will be worked out from, and agrees
 * to that rather than to a number.
 */
export default function MeterOrderScreen() {
  const router = useRouter();
  const { from, carType, setCarType } = useRideDraft();

  const rate = useQuery({
    queryKey: ["rate-card"],
    queryFn: () => ridesApi.rateCard(),
    staleTime: 10 * 60 * 1000,
  });
  const tiers = useQuery({
    queryKey: ["car-types"],
    queryFn: () => ridesApi.carTypes(),
    staleTime: 10 * 60 * 1000,
  });

  const request = useMutation({
    mutationFn: () =>
      ridesApi.request({
        from: from!.coords,
        fromAddress: from!.address,
        // No destination: this is what makes it a metered ride.
        to: null,
        paymentMethod: "cash",
        carType,
      }),
    onSuccess: (ride) =>
      router.replace({ pathname: "/searching/[rideId]", params: { rideId: ride.id } }),
  });

  if (!from) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{t.meterOrder.noPickup}</Text>
        <Button title={t.common.back} variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  const multiplier = Number(
    tiers.data?.find((x) => x.code === carType)?.multiplier ?? 1,
  );
  const card = rate.data;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{t.meterOrder.title}</Text>
        <Text style={styles.subtitle}>{t.meterOrder.subtitle}</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t.meterOrder.pickup}</Text>
          <Text style={styles.pickup}>{from.address}</Text>
        </View>

        {/* The tariff, scaled by the chosen tier, so the numbers shown are the
            ones that will actually apply. */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t.meterOrder.howItIsPriced}</Text>
          {rate.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : card ? (
            <>
              <Line
                label={t.meterOrder.startingFrom}
                value={formatSom(Math.round(card.base_fare * multiplier))}
              />
              <Line
                label={t.meterOrder.perKm}
                value={formatSom(Math.round(card.price_per_km * multiplier))}
              />
              {Number(card.base_km) > 0 ? (
                <Line
                  label={t.meterOrder.included}
                  value={`${Number(card.base_km)} km`}
                />
              ) : null}
              <Line
                label={t.meterOrder.night(card.night_start, card.night_end)}
                value={`×${Number(card.night_multiplier)}`}
              />
              <Text style={styles.note}>{t.meterOrder.note}</Text>
            </>
          ) : (
            <Text style={styles.error}>{t.meterOrder.noRate}</Text>
          )}
        </View>

        <Text style={styles.sectionLabel}>{t.estimate.carType}</Text>
        <View style={styles.tiers}>
          {(tiers.data ?? []).map((tier) => {
            const active = tier.code === carType;
            return (
              <Pressable
                key={tier.code}
                onPress={() => setCarType(tier.code)}
                style={[styles.tier, active && styles.tierActive]}
              >
                <Text style={[styles.tierName, active && styles.tierNameActive]}>
                  {tier.name_uz}
                </Text>
                {card ? (
                  <Text style={styles.tierRate}>
                    {formatSom(Math.round(card.price_per_km * Number(tier.multiplier)))}/km
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {request.isError ? (
          <Text style={styles.error}>{apiError(request.error)}</Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={t.meterOrder.confirm}
          onPress={() => request.mutate()}
          loading={request.isPending}
          disabled={!card}
        />
        <Button title={t.common.back} variant="ghost" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing(3) },
  body: { padding: spacing(5), gap: spacing(4) },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: -spacing(2) },
  card: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
    gap: spacing(2),
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  pickup: { fontSize: 15, fontWeight: "600", color: colors.text },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lineLabel: { fontSize: 14, color: colors.muted, flexShrink: 1 },
  lineValue: { fontSize: 15, fontWeight: "700", color: colors.text },
  note: { fontSize: 12, color: colors.muted, lineHeight: 17, marginTop: spacing(1) },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: colors.muted },
  tiers: { flexDirection: "row", gap: spacing(2), flexWrap: "wrap" },
  tier: {
    flexGrow: 1,
    minWidth: 100,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3),
    alignItems: "center",
    gap: spacing(1),
  },
  tierActive: { borderColor: colors.primary, backgroundColor: "#eff6ff" },
  tierName: { fontSize: 14, fontWeight: "600", color: colors.text },
  tierNameActive: { color: colors.primary },
  tierRate: { fontSize: 12, color: colors.muted },
  error: { fontSize: 13, color: colors.danger },
  footer: {
    padding: spacing(5),
    gap: spacing(2),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
});
