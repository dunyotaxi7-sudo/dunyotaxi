import { useMutation, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BUKHARA_CENTER,
  Map,
  type MapHandle,
  useCurrentLocation,
} from "@/components/Map";
import { driverApi } from "@/lib/api/driver";
import { useDriverSocket } from "@/lib/ws/useLocationStreaming";
import {
  startBackgroundLocation,
  stopBackgroundLocation,
} from "@/lib/backgroundLocation";
import { registerForPush } from "@/lib/push";
import { RideOfferModal } from "@/components/driver/RideOfferModal";
import { useAuth } from "@/store/auth";
import { formatSom } from "@/lib/format";
import { t } from "@/lib/strings";
import type { DriverProfile } from "@/lib/types";
import { colors, radius, spacing } from "@/theme/colors";

export function DriverHome({ driver }: { driver: DriverProfile }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { signOut, setMode } = useAuth();
  const mapRef = useRef<MapHandle>(null);
  const location = useCurrentLocation();
  const [online, setOnline] = useState(driver.is_online);

  const center = location.coords ?? BUKHARA_CENTER;

  const centered = useRef(false);
  useEffect(() => {
    if (location.coords && !centered.current) {
      centered.current = true;
      mapRef.current?.animateTo(location.coords, 15);
    }
  }, [location.coords]);

  // Ride offers arrive over the socket (foreground) or via the pending-offer
  // check after a push wakeup; GPS is streamed by the background task.
  const { connected, offer, clearOffer, setOfferExternal } = useDriverSocket(online);

  // Register this device for push (offer wakeups) once.
  useEffect(() => {
    void registerForPush();
  }, []);

  // Start/stop background GPS streaming with the online state.
  useEffect(() => {
    if (online) void startBackgroundLocation();
    else void stopBackgroundLocation();
    return () => {
      void stopBackgroundLocation();
    };
  }, [online]);

  // Recover a missed offer when the app returns to the foreground.
  useEffect(() => {
    async function checkPending() {
      if (!online) return;
      try {
        const { ride_id } = await driverApi.pendingOffer();
        if (ride_id) setOfferExternal({ ride_id, distance_m: 0, timeout_s: 30 });
      } catch {
        // ignore
      }
    }
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void checkPending();
    });
    void checkPending();
    return () => sub.remove();
  }, [online, setOfferExternal]);

  // Pick up an admin-assigned (or accepted-but-recovered) ride: poll for the
  // driver's current active ride and open it. Only navigates from the home
  // screen so it never stacks over an already-open pickup/trip screen.
  const handledRide = useRef<string | null>(null);
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    async function check() {
      try {
        const { ride_id, status } = await driverApi.currentRide();
        if (cancelled || !ride_id) {
          if (!ride_id) handledRide.current = null;
          return;
        }
        if (ride_id === handledRide.current || pathname !== "/") return;
        handledRide.current = ride_id;
        router.push(
          status === "ongoing"
            ? { pathname: "/trip/[rideId]", params: { rideId: ride_id } }
            : { pathname: "/pickup/[rideId]", params: { rideId: ride_id } },
        );
      } catch {
        // ignore — transient
      }
    }
    void check();
    const id = setInterval(check, 6000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [online, pathname, router]);

  const stats = useQuery({
    queryKey: ["driver-today"],
    queryFn: () => driverApi.statsToday(),
    refetchInterval: 15000,
  });
  const wallet = useQuery({
    queryKey: ["driver-wallet"],
    queryFn: () => driverApi.wallet(),
    refetchInterval: 20000,
  });

  const toggle = useMutation({
    mutationFn: (next: boolean) => driverApi.setOnline(next),
    onSuccess: (_d, next) => setOnline(next),
    onError: () => Alert.alert(t.driver.home.statusError),
  });

  async function onToggle() {
    const next = !online;
    if (next) {
      const ok = await startBackgroundLocation();
      if (!ok) {
        Alert.alert(t.driver.home.needLocation);
        return;
      }
    }
    toggle.mutate(next);
  }

  return (
    <View style={styles.root}>
      <Map
        ref={mapRef}
        markers={[]}
        initialCamera={{ center, zoom: 15 }}
        showUserLocation
      />

      {/* Top card: status + today's stats */}
      <View style={[styles.topCard, { top: insets.top + spacing(3) }]}>
        <View style={styles.statusRow}>
          <View style={styles.statusLeft}>
            <View
              style={[styles.dot, { backgroundColor: online ? colors.success : colors.muted }]}
            />
            <Text style={styles.statusText}>
              {online ? t.driver.home.online : t.driver.home.offline}
            </Text>
            {online && connected ? (
              <Text style={styles.gps}>· {t.driver.home.gpsStreaming}</Text>
            ) : null}
          </View>
          <Pressable onPress={() => void signOut()} hitSlop={8}>
            <Text style={styles.logout}>⎋</Text>
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <Stat
            label={t.driver.home.todayRides}
            value={String(stats.data?.rides_completed ?? 0)}
          />
          <View style={styles.statDivider} />
          <Stat
            label={t.driver.home.todayEarnings}
            value={formatSom(stats.data?.earnings_sum ?? 0)}
          />
        </View>

        {/* Menu */}
        <View style={styles.menuRow}>
          <MenuButton label={t.driver.menu.earnings} onPress={() => router.push("/earnings")} />
          <MenuButton label={t.driver.menu.wallet} onPress={() => router.push("/wallet")} />
          <MenuButton label={t.driver.menu.history} onPress={() => router.push("/history")} />
        </View>

        {/* Same account can ride as a passenger too. */}
        <Pressable style={styles.modeBtn} onPress={() => void setMode("passenger")}>
          <Text style={styles.modeTxt}>🧍 {t.mode.toPassenger}</Text>
        </Pressable>

        {wallet.data?.blocked ? (
          <Pressable style={styles.lowBalance} onPress={() => router.push("/wallet")}>
            <Text style={styles.lowBalanceText}>
              ⚠ {t.driver.wallet.blockedTitle} · {t.driver.menu.wallet} →
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Recenter */}
      <Pressable
        onPress={() => location.coords && mapRef.current?.animateTo(location.coords, 15)}
        style={[styles.locateBtn, { bottom: insets.bottom + spacing(24) }]}
      >
        <Text style={styles.locateIcon}>◎</Text>
      </Pressable>

      {/* Online/offline toggle */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing(4) }]}>
        <Pressable
          onPress={onToggle}
          disabled={toggle.isPending}
          style={[styles.toggle, online ? styles.toggleOnline : styles.toggleOffline]}
        >
          <Text style={styles.toggleText}>
            {toggle.isPending
              ? "…"
              : online
                ? t.driver.home.goOffline
                : t.driver.home.goOnline}
          </Text>
        </Pressable>
      </View>

      {/* Incoming ride offer */}
      {offer ? <RideOfferModal offer={offer} onClose={clearOffer} /> : null}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MenuButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.menuBtn} onPress={onPress}>
      <Text style={styles.menuText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  topCard: {
    position: "absolute",
    left: spacing(4),
    right: spacing(4),
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing(4),
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusLeft: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 15, fontWeight: "700", color: colors.text },
  gps: { fontSize: 12, color: colors.success },
  logout: { fontSize: 20, color: colors.muted },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing(3),
    paddingTop: spacing(3),
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stat: { flex: 1, alignItems: "center" },
  statDivider: { width: 1, height: 32, backgroundColor: colors.border },
  statValue: { fontSize: 18, fontWeight: "700", color: colors.text },
  statLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },
  menuRow: { flexDirection: "row", gap: spacing(2), marginTop: spacing(3) },
  modeBtn: {
    marginTop: spacing(2),
    alignItems: "center",
    paddingVertical: spacing(2),
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  modeTxt: { fontSize: 13, fontWeight: "600", color: colors.primary },
  lowBalance: {
    marginTop: spacing(3),
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(3),
  },
  lowBalanceText: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  menuBtn: {
    flex: 1,
    paddingVertical: spacing(2),
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  menuText: { fontSize: 13, fontWeight: "600", color: colors.primary },
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
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing(5),
    paddingTop: spacing(3),
  },
  toggle: {
    height: 58,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  toggleOffline: { backgroundColor: colors.primary },
  toggleOnline: { backgroundColor: colors.danger },
  toggleText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
