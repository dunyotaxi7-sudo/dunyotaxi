import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Map, type MapHandle, type MapMarker } from "@/components/Map";
import { driverApi } from "@/lib/api/driver";
import { Button } from "@/components/ui/Button";
import { formatSom } from "@/lib/format";
import { openExternalNav } from "@/lib/nav";
import { paymentLabel, t } from "@/lib/strings";
import { colors, radius, spacing } from "@/theme/colors";

export default function DriverTripScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const mapRef = useRef<MapHandle>(null);

  const view = useQuery({
    queryKey: ["driver-ride", rideId],
    queryFn: () => driverApi.rideView(rideId),
    refetchInterval: 4000,
  });
  const ride = view.data;

  const fitted = useRef(false);
  useEffect(() => {
    if (ride && !fitted.current) {
      fitted.current = true;
      setTimeout(
        () =>
          mapRef.current?.fit([
            { lat: ride.from_lat, lng: ride.from_lng },
            { lat: ride.to_lat, lng: ride.to_lng },
          ]),
        350,
      );
    }
  }, [ride]);

  const finish = useMutation({
    mutationFn: () => driverApi.completeRide(rideId, ride?.payment_method ?? "cash"),
    onSuccess: () => router.replace({ pathname: "/summary/[rideId]", params: { rideId } }),
  });

  useEffect(() => {
    if (ride?.status === "cancelled") router.replace("/");
  }, [ride?.status]);

  if (view.isLoading || !ride) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const markers: MapMarker[] = [
    { id: "pickup", coordinate: { lat: ride.from_lat, lng: ride.from_lng }, kind: "pickup" },
    { id: "dropoff", coordinate: { lat: ride.to_lat, lng: ride.to_lng }, kind: "dropoff" },
  ];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View style={styles.mapWrap}>
        <Map
          ref={mapRef}
          markers={markers}
          route={[
            { lat: ride.from_lat, lng: ride.from_lng },
            { lat: ride.to_lat, lng: ride.to_lng },
          ]}
          initialCamera={{ center: { lat: ride.to_lat, lng: ride.to_lng }, zoom: 13 }}
          showUserLocation
        />
      </View>

      <View style={[styles.banner, { top: insets.top + spacing(3) }]}>
        <Text style={styles.bannerText}>{t.driver.trip.title}</Text>
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing(4) }]}>
        <View style={styles.handle} />

        <Text style={styles.label}>{t.driver.trip.destination}</Text>
        <Text style={styles.addr} numberOfLines={2}>{ride.to_address}</Text>

        <View style={styles.fareRow}>
          <Text style={styles.fare}>{formatSom(ride.price_sum)}</Text>
          <Text style={styles.pay}>{paymentLabel(ride.payment_method)}</Text>
        </View>

        <Pressable
          style={styles.navBtn}
          onPress={() => void openExternalNav(ride.to_lat, ride.to_lng)}
        >
          <Text style={styles.navText}>🧭 {t.driver.pickup.navigation}</Text>
        </Pressable>

        <Button
          title={t.driver.trip.finish}
          onPress={() => finish.mutate()}
          loading={finish.isPending}
          style={{ marginTop: spacing(3) }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  mapWrap: { flex: 1 },
  banner: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: colors.text,
    borderRadius: radius.lg,
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(3),
  },
  bannerText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing(5),
    paddingTop: spacing(3),
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing(4) },
  label: { fontSize: 12, color: colors.muted },
  addr: { fontSize: 16, color: colors.text, marginTop: 2 },
  fareRow: { flexDirection: "row", alignItems: "baseline", gap: spacing(3), marginTop: spacing(3) },
  fare: { fontSize: 24, fontWeight: "800", color: colors.text },
  pay: { fontSize: 14, color: colors.muted },
  navBtn: {
    height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary,
    alignItems: "center", justifyContent: "center", marginTop: spacing(4),
  },
  navText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
});
