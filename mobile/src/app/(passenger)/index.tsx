import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BUKHARA_CENTER,
  Map,
  type Coords,
  type MapHandle,
  type MapMarker,
  isWithinServiceArea,
  reverseGeocode,
  useCurrentLocation,
} from "@/components/Map";
import { ridesApi } from "@/lib/api/rides";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/strings";
import { useAuth } from "@/store/auth";
import { useRideDraft } from "@/store/ride";
import { colors, radius, spacing } from "@/theme/colors";

export default function PassengerHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapHandle>(null);
  const location = useCurrentLocation();
  const { user, setMode } = useAuth();
  const { from, to, setFrom } = useRideDraft();

  const center: Coords = location.coords ?? BUKHARA_CENTER;

  // Recenter the camera once we have the user's position.
  const centeredRef = useRef(false);
  useEffect(() => {
    if (location.coords && !centeredRef.current) {
      centeredRef.current = true;
      mapRef.current?.animateTo(location.coords, 15);
    }
  }, [location.coords]);

  // Default "Qayerdan" to the user's current location, once. Set it immediately
  // (so the field is never empty) and refine the label once geocoding returns.
  // The user can still tap the row to change it.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (location.coords && !from && !prefilledRef.current) {
      prefilledRef.current = true;
      const coords = location.coords;
      setFrom({ coords, address: t.home.myLocation });
      void reverseGeocode(coords).then((address) =>
        setFrom({ coords, address: address || t.home.myLocation }),
      );
    }
  }, [location.coords, from, setFrom]);

  // Nearby online drivers — refresh every 10s.
  const drivers = useQuery({
    queryKey: ["nearby-drivers", round(center.lat), round(center.lng)],
    queryFn: () => ridesApi.nearbyDrivers(center),
    refetchInterval: 10_000,
    enabled: Boolean(location.coords),
  });

  const markers: MapMarker[] = useMemo(
    () =>
      (drivers.data ?? []).map((d) => ({
        id: d.driver_id,
        coordinate: { lat: d.lat, lng: d.lng },
        kind: "driver",
        title: "Haydovchi",
      })),
    [drivers.data],
  );

  const fromOutside = Boolean(from && !isWithinServiceArea(from.coords));
  const toOutside = Boolean(to && !isWithinServiceArea(to.coords));
  const canContinue = Boolean(from && to) && !fromOutside && !toOutside;

  return (
    <View style={styles.root}>
      <Map
        ref={mapRef}
        markers={markers}
        initialCamera={{ center, zoom: 15 }}
        showUserLocation
        showServiceArea
      />

      {/* Top-left: profile + history */}
      <View style={[styles.topLeft, { top: insets.top + spacing(3) }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.push("/profile")}>
          <Text style={styles.iconTxt}>👤</Text>
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => router.push("/history")}>
          <Text style={styles.iconTxt}>🕘</Text>
        </Pressable>
        {/* Same account can drive too — switching opens the driver app (and
            walks newcomers through registration). */}
        <Pressable
          style={styles.modeBtn}
          onPress={() => void setMode("driver")}
        >
          <Text style={styles.modeTxt}>
            🚗 {user?.is_driver ? t.mode.toDriver : t.mode.becomeDriver}
          </Text>
        </Pressable>
      </View>

      {/* Recenter button */}
      <Pressable
        onPress={() =>
          location.coords && mapRef.current?.animateTo(location.coords, 15)
        }
        style={[styles.locateBtn, { top: insets.top + spacing(3) }]}
      >
        <Text style={styles.locateIcon}>◎</Text>
      </Pressable>

      {location.status === "denied" && (
        <View style={[styles.permBanner, { top: insets.top + spacing(16) }]}>
          <Text style={styles.permText}>{t.home.permDenied}</Text>
        </View>
      )}

      {/* Bottom sheet */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing(4) }]}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>{t.home.whereTo}</Text>

        <PlaceRow
          dotColor={colors.primary}
          label={t.home.from}
          value={from?.address}
          placeholder={t.home.fromPlaceholder}
          onPress={() =>
            router.push({ pathname: "/pick-location", params: { target: "from" } })
          }
        />
        <View style={styles.divider} />
        <PlaceRow
          dotColor={colors.danger}
          label={t.home.to}
          value={to?.address}
          placeholder={t.home.toPlaceholder}
          onPress={() =>
            router.push({ pathname: "/pick-location", params: { target: "to" } })
          }
        />

        {fromOutside || toOutside ? (
          <Text style={styles.outside}>⚠ {t.home.outsideArea}</Text>
        ) : null}

        <Button
          title={t.home.seePrice}
          onPress={() => router.push("/estimate")}
          disabled={!canContinue}
          style={{ marginTop: spacing(4) }}
        />
      </View>
    </View>
  );
}

function PlaceRow({
  dotColor,
  label,
  value,
  placeholder,
  onPress,
}: {
  dotColor: string;
  label: string;
  value?: string;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.placeRow}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <View style={styles.placeText}>
        <Text style={styles.placeLabel}>{label}</Text>
        <Text
          style={[styles.placeValue, !value && styles.placeholder]}
          numberOfLines={1}
        >
          {value ?? placeholder}
        </Text>
      </View>
    </Pressable>
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  locateBtn: {
    position: "absolute",
    right: spacing(4),
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  locateIcon: { fontSize: 22, color: colors.primary },
  topLeft: { position: "absolute", left: spacing(4), flexDirection: "row", gap: spacing(2) },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  iconTxt: { fontSize: 18 },
  modeBtn: {
    height: 44,
    paddingHorizontal: spacing(3),
    borderRadius: 22,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  modeTxt: { fontSize: 13, fontWeight: "600", color: colors.primary },
  permBanner: {
    position: "absolute",
    left: spacing(4),
    right: spacing(16),
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing(3),
  },
  permText: { color: colors.danger, fontSize: 13 },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
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
    marginBottom: spacing(3),
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing(3),
  },
  placeRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing(2) },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing(3) },
  placeText: { flex: 1 },
  placeLabel: { fontSize: 12, color: colors.muted },
  placeValue: { fontSize: 15, color: colors.text, marginTop: 2 },
  placeholder: { color: colors.muted },
  outside: { color: colors.danger, fontSize: 13, marginTop: spacing(3), textAlign: "center" },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing(6),
  },
});
