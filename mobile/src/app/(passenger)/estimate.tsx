import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Map, type MapHandle, type MapMarker } from "@/components/Map";
import { ridesApi } from "@/lib/api/rides";
import { apiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { formatSom } from "@/lib/format";
import { t } from "@/lib/strings";
import type { PaymentMethod } from "@/lib/types";
import { useRideDraft } from "@/store/ride";
import { colors, radius, spacing } from "@/theme/colors";

export default function EstimateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapHandle>(null);
  const { from, to } = useRideDraft();

  // Payments are cash-only for now.
  const payment: PaymentMethod = "cash";
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);

  // Frame the route once the map has mounted.
  useEffect(() => {
    if (!from || !to) return;
    const t = setTimeout(() => mapRef.current?.fit([from.coords, to.coords]), 350);
    return () => clearTimeout(t);
  }, [from, to]);

  const estimate = useQuery({
    queryKey: ["estimate", from?.coords, to?.coords, appliedPromo],
    queryFn: () =>
      ridesApi.estimate({
        from: from!.coords,
        to: to!.coords,
        promoCode: appliedPromo ?? undefined,
      }),
    enabled: Boolean(from && to),
  });

  const request = useMutation({
    mutationFn: () =>
      ridesApi.request({
        from: from!.coords,
        to: to!.coords,
        fromAddress: from!.address,
        toAddress: to!.address,
        paymentMethod: payment,
        promoCode: appliedPromo ?? undefined,
      }),
    onSuccess: (ride) => {
      router.replace({
        pathname: "/searching/[rideId]",
        params: { rideId: ride.id },
      });
    },
  });

  if (!from || !to) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{t.estimate.noRoute}</Text>
        <Button title={t.common.back} variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  const markers: MapMarker[] = [
    { id: "from", coordinate: from.coords, kind: "pickup", title: from.address },
    { id: "to", coordinate: to.coords, kind: "dropoff", title: to.address },
  ];
  const mid = {
    lat: (from.coords.lat + to.coords.lat) / 2,
    lng: (from.coords.lng + to.coords.lng) / 2,
  };

  const data = estimate.data;
  const hasDiscount = (data?.discount ?? 0) > 0;
  const promoInvalid = appliedPromo != null && !estimate.isLoading && !hasDiscount;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.mapWrap}>
        <Map
          ref={mapRef}
          markers={markers}
          route={[from.coords, to.coords]}
          initialCamera={{ center: mid, zoom: 13 }}
          showUserLocation={false}
        />
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { top: insets.top + spacing(3) }]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.sheet}
        contentContainerStyle={{ padding: spacing(5), paddingBottom: insets.bottom + spacing(6) }}
      >
        {estimate.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.muted}>{t.estimate.calculating}</Text>
          </View>
        ) : estimate.isError ? (
          <View style={styles.loading}>
            <Text style={styles.errorText}>{apiError(estimate.error)}</Text>
            <Button title={t.common.retry} variant="ghost" onPress={() => estimate.refetch()} />
          </View>
        ) : data ? (
          <>
            {/* trip meta */}
            <View style={styles.metaRow}>
              <Meta label={t.estimate.distance} value={`${data.distance_km.toFixed(1)} km`} />
              <Meta label={t.estimate.duration} value={t.estimate.minutes(data.duration_min)} />
              {data.night ? <NightBadge /> : null}
            </View>

            {/* price */}
            <View style={styles.priceBlock}>
              {hasDiscount ? (
                <>
                  <Text style={styles.priceStrike}>{formatSom(data.price_sum)}</Text>
                  <Text style={styles.price}>{formatSom(data.final_price)}</Text>
                  <Text style={styles.discount}>
                    {t.estimate.discount(formatSom(data.discount))}
                  </Text>
                </>
              ) : (
                <Text style={styles.price}>{formatSom(data.final_price)}</Text>
              )}
            </View>

            {/* payment — cash only */}
            <Text style={styles.sectionLabel}>{t.estimate.payment}</Text>
            <View style={styles.payRow}>
              <Text style={styles.payIcon}>💵</Text>
              <Text style={styles.payText}>{t.payments.cash}</Text>
            </View>

            {/* promo */}
            <Text style={styles.sectionLabel}>{t.estimate.promo}</Text>
            <View style={styles.promoRow}>
              <TextInput
                style={styles.promoInput}
                value={promoInput}
                onChangeText={(text) => setPromoInput(text.toUpperCase())}
                placeholder={t.estimate.promoPlaceholder}
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
              />
              <Pressable
                style={styles.promoBtn}
                onPress={() => setAppliedPromo(promoInput.trim() || null)}
              >
                <Text style={styles.promoBtnText}>{t.estimate.apply}</Text>
              </Pressable>
            </View>
            {promoInvalid ? (
              <Text style={styles.promoErr}>{t.estimate.promoInvalid}</Text>
            ) : hasDiscount ? (
              <Text style={styles.promoOk}>{t.estimate.promoOk}</Text>
            ) : null}

            <Button
              title={t.estimate.order}
              onPress={() => request.mutate()}
              loading={request.isPending}
              style={{ marginTop: spacing(5) }}
            />
            {request.isError ? (
              <Text style={styles.promoErr}>{apiError(request.error)}</Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function NightBadge() {
  return (
    <View style={styles.nightBadge}>
      <Text style={styles.nightText}>{t.estimate.night}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing(3) },
  mapWrap: { height: "42%" },
  backBtn: {
    position: "absolute",
    left: spacing(4),
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -20,
  },
  loading: { alignItems: "center", gap: spacing(3), paddingVertical: spacing(8) },
  muted: { color: colors.muted, fontSize: 14 },
  errorText: { color: colors.danger, fontSize: 15, textAlign: "center" },
  metaRow: { flexDirection: "row", gap: spacing(8), alignItems: "center", flexWrap: "wrap" },
  metaLabel: { fontSize: 12, color: colors.muted },
  metaValue: { fontSize: 16, fontWeight: "600", color: colors.text, marginTop: 2 },
  nightBadge: {
    backgroundColor: "#eef2ff",
    borderRadius: radius.sm,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
  },
  nightText: { fontSize: 12, color: colors.primary, fontWeight: "500" },
  priceBlock: { marginTop: spacing(5), marginBottom: spacing(2) },
  price: { fontSize: 34, fontWeight: "800", color: colors.text },
  priceStrike: {
    fontSize: 16,
    color: colors.muted,
    textDecorationLine: "line-through",
  },
  discount: { fontSize: 14, color: colors.success, marginTop: 2 },
  sectionLabel: { fontSize: 13, color: colors.muted, marginTop: spacing(5), marginBottom: spacing(2) },
  payRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    height: 52,
    paddingHorizontal: spacing(4),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  payIcon: { fontSize: 20 },
  payText: { fontSize: 16, fontWeight: "600", color: colors.text },
  promoRow: { flexDirection: "row", gap: spacing(2) },
  promoInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3),
    fontSize: 15,
    color: colors.text,
  },
  promoBtn: {
    paddingHorizontal: spacing(4),
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  promoBtnText: { color: colors.primary, fontWeight: "600" },
  promoErr: { color: colors.danger, fontSize: 13, marginTop: spacing(2) },
  promoOk: { color: colors.success, fontSize: 13, marginTop: spacing(2) },
});
