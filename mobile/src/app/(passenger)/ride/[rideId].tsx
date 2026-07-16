import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Map, type Coords, type MapHandle, type MapMarker } from "@/components/Map";
import { ridesApi } from "@/lib/api/rides";
import { useRideSocket } from "@/lib/ws/useRideSocket";
import { Button } from "@/components/ui/Button";
import { formatSom } from "@/lib/format";
import { paymentLabel, t } from "@/lib/strings";
import type { RideStatus } from "@/lib/types";
import { useRideDraft } from "@/store/ride";
import { colors, radius, spacing } from "@/theme/colors";

export default function ActiveRideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapHandle>(null);
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { from, to } = useRideDraft();

  const { lastEvent, driverLocation } = useRideSocket(rideId);

  const rideQuery = useQuery({
    queryKey: ["ride", rideId],
    queryFn: () => ridesApi.get(rideId),
    refetchInterval: 5000,
  });
  const driverQuery = useQuery({
    queryKey: ["ride-driver", rideId],
    queryFn: () => ridesApi.driver(rideId),
  });

  const status: RideStatus | undefined =
    lastEvent?.status ?? rideQuery.data?.status;

  // Follow the driver smoothly (updates arrive ~every 5s).
  useEffect(() => {
    if (driverLocation) mapRef.current?.animateTo(driverLocation, 15);
  }, [driverLocation]);

  // Frame pickup + dropoff once at the start.
  const fittedRef = useRef(false);
  useEffect(() => {
    if (!fittedRef.current && from && to) {
      fittedRef.current = true;
      setTimeout(() => mapRef.current?.fit([from.coords, to.coords]), 350);
    }
  }, [from, to]);

  // Terminal transitions.
  const navigatedRef = useRef(false);
  useEffect(() => {
    if (navigatedRef.current) return;
    if (status === "completed") {
      navigatedRef.current = true;
      router.replace({ pathname: "/rating/[rideId]", params: { rideId } });
    } else if (status === "cancelled") {
      navigatedRef.current = true;
      router.replace("/");
    }
  }, [status, rideId, router]);

  const pickup: Coords | undefined = from?.coords;
  const dropoff: Coords | undefined = to?.coords;

  const markers: MapMarker[] = [];
  if (driverLocation)
    markers.push({ id: "driver", coordinate: driverLocation, kind: "driver", title: "Haydovchi" });
  if (pickup) markers.push({ id: "from", coordinate: pickup, kind: "pickup" });
  if (dropoff) markers.push({ id: "to", coordinate: dropoff, kind: "dropoff" });

  const driver = driverQuery.data;
  const ride = rideQuery.data;
  const canCancel = status === "accepted" || status === "arrived";

  function callDriver() {
    if (driver?.phone) void Linking.openURL(`tel:${driver.phone}`);
  }

  async function cancel() {
    await ridesApi.cancel(rideId, "passenger_cancelled").catch(() => {});
    router.replace("/");
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      <View style={styles.mapWrap}>
        <Map
          ref={mapRef}
          markers={markers}
          route={pickup && dropoff ? [pickup, dropoff] : undefined}
          initialCamera={
            pickup ?? driverLocation
              ? { center: (pickup ?? driverLocation)!, zoom: 14 }
              : undefined
          }
          showUserLocation={false}
        />
      </View>

      {/* Status banner */}
      <View style={[styles.banner, { top: insets.top + spacing(3) }]}>
        <Text style={styles.bannerText}>
          {status ? t.ride.status[status] ?? "Sayohat" : t.common.loading}
        </Text>
      </View>

      {/* Bottom sheet: driver card */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing(4) }]}>
        <View style={styles.handle} />

        {driver ? (
          <View style={styles.driverRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {driver.full_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.driverName}>{driver.full_name}</Text>
              <Text style={styles.carLine}>
                {driver.car_model}
                {driver.car_color ? ` · ${driver.car_color}` : ""}
              </Text>
              <Text style={styles.plate}>{driver.car_number}</Text>
            </View>
            <View style={styles.ratingBox}>
              <Text style={styles.rating}>★ {Number(driver.rating).toFixed(1)}</Text>
            </View>
            <Pressable style={styles.callBtn} onPress={callDriver}>
              <Text style={styles.callIcon}>📞</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.muted}>{t.ride.driverLoading}</Text>
        )}

        <View style={styles.fareRow}>
          <Text style={styles.muted}>{t.ride.payment}</Text>
          <Text style={styles.fare}>
            {formatSom(ride?.price_sum)} · {paymentLabel(ride?.payment_method)}
          </Text>
        </View>

        {canCancel && (
          <Button
            title={t.common.cancel}
            variant="ghost"
            onPress={cancel}
            style={{ marginTop: spacing(3) }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  mapWrap: { flex: 1 },
  banner: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: colors.text,
    borderRadius: radius.lg,
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(3),
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
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
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing(4),
  },
  driverRow: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 20, fontWeight: "700", color: colors.primary },
  driverName: { fontSize: 16, fontWeight: "700", color: colors.text },
  carLine: { fontSize: 13, color: colors.muted, marginTop: 1 },
  plate: { fontSize: 13, color: colors.text, fontWeight: "600", marginTop: 2 },
  ratingBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
  },
  rating: { fontSize: 13, fontWeight: "600", color: colors.text },
  callBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#e8f5ee",
    alignItems: "center",
    justifyContent: "center",
  },
  callIcon: { fontSize: 20 },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing(4),
    paddingTop: spacing(3),
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  fare: { fontSize: 16, fontWeight: "700", color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
});
