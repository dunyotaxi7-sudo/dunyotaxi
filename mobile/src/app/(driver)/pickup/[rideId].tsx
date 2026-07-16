import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Map, type MapHandle, type MapMarker, useCurrentLocation } from "@/components/Map";
import { driverApi } from "@/lib/api/driver";
import { Button } from "@/components/ui/Button";
import { callPhone, openExternalNav } from "@/lib/nav";
import { t } from "@/lib/strings";
import { colors, radius, spacing } from "@/theme/colors";

export default function DriverPickupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const mapRef = useRef<MapHandle>(null);
  const location = useCurrentLocation();

  const view = useQuery({
    queryKey: ["driver-ride", rideId],
    queryFn: () => driverApi.rideView(rideId),
    refetchInterval: 3000,
  });
  const ride = view.data;

  // Frame driver + pickup.
  const fitted = useRef(false);
  useEffect(() => {
    if (ride && location.coords && !fitted.current) {
      fitted.current = true;
      setTimeout(
        () => mapRef.current?.fit([location.coords!, { lat: ride.from_lat, lng: ride.from_lng }]),
        350,
      );
    }
  }, [ride, location.coords]);

  const arrived = useMutation({
    mutationFn: () => driverApi.arrived(rideId),
    onSuccess: () => view.refetch(),
  });
  const start = useMutation({
    mutationFn: () => driverApi.startRide(rideId),
    onSuccess: () => router.replace({ pathname: "/trip/[rideId]", params: { rideId } }),
  });
  const decline = useMutation({
    mutationFn: () => driverApi.declineRide(rideId),
    onSuccess: () => router.replace("/"),
  });

  function confirmDecline() {
    Alert.alert(
      t.driver.pickup.declineConfirmTitle,
      t.driver.pickup.declineConfirmBody,
      [
        { text: t.common.cancel, style: "cancel" },
        {
          text: t.driver.pickup.decline,
          style: "destructive",
          onPress: () => decline.mutate(),
        },
      ],
    );
  }

  // Terminal / progression handling.
  useEffect(() => {
    if (!ride) return;
    if (ride.status === "cancelled") router.replace("/");
    else if (ride.status === "ongoing") {
      router.replace({ pathname: "/trip/[rideId]", params: { rideId } });
    }
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
  ];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View style={styles.mapWrap}>
        <Map
          ref={mapRef}
          markers={markers}
          route={location.coords ? [location.coords, { lat: ride.from_lat, lng: ride.from_lng }] : undefined}
          initialCamera={{ center: { lat: ride.from_lat, lng: ride.from_lng }, zoom: 14 }}
          showUserLocation
        />
      </View>

      <View style={[styles.banner, { top: insets.top + spacing(3) }]}>
        <Text style={styles.bannerText}>{t.driver.pickup.title}</Text>
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing(4) }]}>
        <View style={styles.handle} />

        {/* Passenger card */}
        <View style={styles.paxRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{ride.passenger_name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.paxName}>{ride.passenger_name}</Text>
            <Text style={styles.paxRating}>
              {ride.passenger_rating != null ? `★ ${ride.passenger_rating.toFixed(1)}` : "★ —"}
            </Text>
          </View>
          <Pressable style={styles.callBtn} onPress={() => callPhone(ride.passenger_phone)}>
            <Text style={styles.callIcon}>📞</Text>
          </Pressable>
        </View>

        <Text style={styles.addr} numberOfLines={2}>{ride.from_address}</Text>

        <View style={styles.actions}>
          <Pressable
            style={styles.navBtn}
            onPress={() => openExternalNav(ride.from_lat, ride.from_lng, ride.from_address)}
          >
            <Text style={styles.navText}>🧭 {t.driver.pickup.navigation}</Text>
          </Pressable>
        </View>

        {ride.status === "accepted" ? (
          <>
            <Button
              title={t.driver.pickup.arrived}
              onPress={() => arrived.mutate()}
              loading={arrived.isPending}
              style={{ marginTop: spacing(3) }}
            />
            <Pressable
              onPress={confirmDecline}
              disabled={decline.isPending}
              style={styles.declineBtn}
            >
              <Text style={styles.declineText}>
                {decline.isPending ? "…" : t.driver.pickup.decline}
              </Text>
            </Pressable>
          </>
        ) : (
          <Button
            title={t.driver.pickup.start}
            onPress={() => start.mutate()}
            loading={start.isPending}
            style={{ marginTop: spacing(3) }}
          />
        )}
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
  paxRow: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "700", color: colors.primary },
  paxName: { fontSize: 16, fontWeight: "700", color: colors.text },
  paxRating: { fontSize: 13, color: colors.muted, marginTop: 1 },
  callBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#e8f5ee", alignItems: "center", justifyContent: "center" },
  callIcon: { fontSize: 20 },
  addr: { fontSize: 15, color: colors.text, marginTop: spacing(4) },
  actions: { marginTop: spacing(3) },
  navBtn: {
    height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  navText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  declineBtn: { marginTop: spacing(3), alignItems: "center", paddingVertical: spacing(2) },
  declineText: { color: colors.danger, fontSize: 15, fontWeight: "600" },
});
