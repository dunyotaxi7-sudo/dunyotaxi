import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import {
  Animated,
  AppState,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ridesApi } from "@/lib/api/rides";
import { apiError } from "@/lib/api/client";
import { useRideSocket } from "@/lib/ws/useRideSocket";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/strings";
import { useRideDraft } from "@/store/ride";
import type { RideStatus } from "@/lib/types";
import { colors, spacing } from "@/theme/colors";

export default function SearchingScreen() {
  const router = useRouter();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { from, to } = useRideDraft();

  // Real-time channel (best effort) …
  const { lastEvent } = useRideSocket(rideId);
  // … plus a polling backstop in case the socket drops.
  const rideQuery = useQuery({
    queryKey: ["ride", rideId],
    queryFn: () => ridesApi.get(rideId),
    refetchInterval: 5000,
    enabled: Boolean(rideId),
  });

  // Refetch when the app returns to the foreground (don't trust a stale socket).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void rideQuery.refetch();
    });
    return () => sub.remove();
  }, [rideQuery]);

  // Effective truth: prefer the freshest socket event, fall back to the poll.
  const status: RideStatus | undefined =
    lastEvent?.status ?? rideQuery.data?.status;
  const cancelledBy =
    lastEvent?.cancelled_by ?? rideQuery.data?.cancelled_by ?? null;

  const navigatedRef = useRef(false);
  useEffect(() => {
    if (navigatedRef.current) return;
    if (status === "accepted" || status === "arrived" || status === "ongoing") {
      navigatedRef.current = true;
      router.replace({ pathname: "/ride/[rideId]", params: { rideId } });
    }
  }, [status, rideId, router]);

  const cancel = useMutation({
    mutationFn: () => ridesApi.cancel(rideId, "passenger_cancelled"),
    onSettled: () => router.replace("/"),
  });

  const retry = useMutation({
    mutationFn: () =>
      ridesApi.request({
        from: from!.coords,
        to: to!.coords,
        fromAddress: from!.address,
        toAddress: to!.address,
        paymentMethod: "cash",
      }),
    onSuccess: (ride) =>
      router.replace({
        pathname: "/searching/[rideId]",
        params: { rideId: ride.id },
      }),
  });

  const noDriver =
    status === "cancelled" && cancelledBy !== "passenger";

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View style={styles.container}>
        {noDriver ? (
          <NoDriver
            onRetry={() => (from && to ? retry.mutate() : router.replace("/"))}
            retrying={retry.isPending}
            onHome={() => router.replace("/")}
            error={retry.isError ? apiError(retry.error) : null}
          />
        ) : (
          <>
            <Pulse />
            <Text style={styles.title}>{t.searching.title}</Text>
            <Text style={styles.sub}>{t.searching.sub}</Text>

            <View style={{ flex: 1 }} />
            <Button
              title={t.common.cancel}
              variant="ghost"
              onPress={() => cancel.mutate()}
              loading={cancel.isPending}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function NoDriver({
  onRetry,
  retrying,
  onHome,
  error,
}: {
  onRetry: () => void;
  retrying: boolean;
  onHome: () => void;
  error: string | null;
}) {
  return (
    <View style={styles.noDriver}>
      <Text style={styles.emoji}>😕</Text>
      <Text style={styles.title}>{t.searching.noDriverTitle}</Text>
      <Text style={styles.sub}>{t.searching.noDriverSub}</Text>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <View style={{ height: spacing(6) }} />
      <Button title={t.common.retry} onPress={onRetry} loading={retrying} style={styles.fullBtn} />
      <Button title={t.common.cancel} variant="ghost" onPress={onHome} style={styles.fullBtn} />
    </View>
  );
}

function Pulse() {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(scale, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  const ringStyle = (delay: number) => ({
    transform: [
      {
        scale: scale.interpolate({
          inputRange: [0, 1],
          outputRange: [0.4 + delay, 2.4 + delay],
        }),
      },
    ],
    opacity: scale.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
  });

  return (
    <View style={styles.pulseWrap}>
      <Animated.View style={[styles.ring, ringStyle(0)]} />
      <Animated.View style={[styles.ring, ringStyle(0.3)]} />
      <View style={styles.core} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, alignItems: "center", padding: spacing(6), paddingTop: spacing(16) },
  pulseWrap: { width: 120, height: 120, alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
  },
  core: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 22, fontWeight: "700", color: colors.text, marginTop: spacing(8), textAlign: "center" },
  sub: { fontSize: 15, color: colors.muted, marginTop: spacing(2), textAlign: "center" },
  noDriver: { flex: 1, alignItems: "center", justifyContent: "center", alignSelf: "stretch" },
  emoji: { fontSize: 48 },
  err: { color: colors.danger, fontSize: 13, marginTop: spacing(3), textAlign: "center" },
  fullBtn: { alignSelf: "stretch", marginTop: spacing(2) },
});
