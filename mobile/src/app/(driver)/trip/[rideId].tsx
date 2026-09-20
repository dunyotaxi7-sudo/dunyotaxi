import { useMutation, useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Map, type MapHandle, type MapMarker, useRoutePoints } from "@/components/Map";
import { driverApi } from "@/lib/api/driver";
import { Button } from "@/components/ui/Button";
import { WaitingMeter } from "@/components/WaitingMeter";
import { formatSom } from "@/lib/format";
import { openExternalNav, openNavigatorAt } from "@/lib/nav";
import { paymentLabel, t } from "@/lib/strings";
import { TripMeter } from "@/components/driver/TripMeter";
import { useTripLocationStream } from "@/lib/useTripLocationStream";
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

  // A metered ride has no destination ("just drive, I'll direct him"), so
  // there is nothing to route to, mark, or navigate at. Null coordinates must
  // never reach the map: the native marker asserts non-null and takes the
  // whole app down with it.
  const dest =
    ride && ride.to_lat != null && ride.to_lng != null
      ? { lat: ride.to_lat, lng: ride.to_lng }
      : null;

  // Real road route pickup → dropoff (straight-line fallback).
  const routePoints = useRoutePoints(
    ride ? { lat: ride.from_lat, lng: ride.from_lng } : null,
    dest,
  );

  // The meter is fed by whatever position reaches the server, so a trip must
  // never depend on the background task alone (see useTripLocationStream).
  useTripLocationStream(ride?.status === "ongoing");

  async function openNavigatorHere() {
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await openNavigatorAt(pos.coords.latitude, pos.coords.longitude);
    } catch {
      // No fix available — fall back to the pickup, which is at least nearby.
      if (ride) await openNavigatorAt(ride.from_lat, ride.from_lng);
    }
  }

  const fitted = useRef(false);
  useEffect(() => {
    if (ride && !fitted.current) {
      fitted.current = true;
      setTimeout(
        () =>
          mapRef.current?.fit(
            dest
              ? [{ lat: ride.from_lat, lng: ride.from_lng }, dest]
              : [{ lat: ride.from_lat, lng: ride.from_lng }],
          ),
        350,
      );
    }
  }, [ride]);

  const finish = useMutation({
    mutationFn: () => driverApi.completeRide(rideId, ride?.payment_method ?? "cash"),
    onSuccess: () => router.replace({ pathname: "/summary/[rideId]", params: { rideId } }),
  });
  const waitToggle = useMutation({
    mutationFn: () =>
      ride?.waiting_started_at
        ? driverApi.waitStop(rideId)
        : driverApi.waitStart(rideId),
    onSuccess: () => view.refetch(),
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
    ...(dest
      ? [{ id: "dropoff", coordinate: dest, kind: "dropoff" as const }]
      : []),
  ];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View style={styles.mapWrap}>
        <Map
          ref={mapRef}
          markers={markers}
          route={routePoints}
          initialCamera={{
            center: dest ?? { lat: ride.from_lat, lng: ride.from_lng },
            zoom: 13,
          }}
          showUserLocation
        />
      </View>

      <View style={[styles.banner, { top: insets.top + spacing(3) }]}>
        <Text style={styles.bannerText}>{t.driver.trip.title}</Text>
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing(4) }]}>
        <View style={styles.handle} />

        <Text style={styles.label}>{t.driver.trip.destination}</Text>
        <Text style={styles.addr} numberOfLines={2}>
          {ride.to_address ?? t.driver.trip.noDestination}
        </Text>

        {ride.fare_mode === "meter" ? (
          <View style={{ marginTop: spacing(3) }}>
            <TripMeter rideId={rideId} active={ride.status === "ongoing"} />
            <Text style={styles.payMeter}>
              {paymentLabel(ride.payment_method)}
            </Text>
            {/* No destination to route to, but the navigator is easy to close
                by accident — this puts it back, centred on the driver. */}
            <Pressable style={styles.navBtn} onPress={openNavigatorHere}>
              <Text style={styles.navText}>🧭 {t.driver.trip.openNavigator}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.fareRow}>
            <Text style={styles.fare}>{formatSom(ride.price_sum)}</Text>
            <Text style={styles.pay}>{paymentLabel(ride.payment_method)}</Text>
          </View>
        )}

        {dest ? (
          <Pressable
            style={styles.navBtn}
            onPress={() => void openExternalNav(dest.lat, dest.lng)}
          >
            <Text style={styles.navText}>🧭 {t.driver.pickup.navigation}</Text>
          </Pressable>
        ) : null}

        <View style={{ marginTop: spacing(3) }}>
          <WaitingMeter
            waitingSeconds={ride.waiting_seconds}
            waitingStartedAt={ride.waiting_started_at}
            onToggle={() => waitToggle.mutate()}
            pending={waitToggle.isPending}
          />
        </View>

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
  payMeter: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing(2),
  },
  fareRow: { flexDirection: "row", alignItems: "baseline", gap: spacing(3), marginTop: spacing(3) },
  fare: { fontSize: 24, fontWeight: "800", color: colors.text },
  pay: { fontSize: 14, color: colors.muted },
  navBtn: {
    height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary,
    alignItems: "center", justifyContent: "center", marginTop: spacing(4),
  },
  navText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
});
