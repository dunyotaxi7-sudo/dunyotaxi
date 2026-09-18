import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { reverseGeocode, useCurrentLocation } from "@/components/Map";
import { Button } from "@/components/ui/Button";
import { apiError, isNotFound } from "@/lib/api/client";
import { locationRequestsApi } from "@/lib/api/location";
import { t } from "@/lib/strings";
import { colors, radius, spacing } from "@/theme/colors";

/**
 * "The operator is asking where you are."
 *
 * Opened by tapping a `location_request` push, for passengers who ordered by
 * calling the dispatcher instead of using the app. We take a position locally
 * as soon as the screen opens so the button is instant, but nothing leaves the
 * phone until the passenger presses Send — that press is the consent.
 */
export default function ShareLocationScreen() {
  const router = useRouter();
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const location = useCurrentLocation();
  const [done, setDone] = useState<"shared" | "declined" | null>(null);

  // Is the request still open? It expires, and the operator may have moved on.
  const request = useQuery({
    queryKey: ["location-request", requestId],
    queryFn: () => locationRequestsApi.get(requestId),
    retry: false,
    enabled: Boolean(requestId),
  });

  const share = useMutation({
    mutationFn: async () => {
      const coords = location.coords;
      if (!coords) throw new Error(t.shareLocation.locating);
      // A label is a nicety for the operator — never block the send on it.
      let address: string | undefined;
      try {
        address = (await reverseGeocode(coords)) || undefined;
      } catch {
        address = undefined;
      }
      return locationRequestsApi.share(requestId, {
        coords,
        address,
        accuracyM: location.accuracy,
      });
    },
    onSuccess: () => setDone("shared"),
  });

  const decline = useMutation({
    mutationFn: () => locationRequestsApi.decline(requestId),
    onSuccess: () => setDone("declined"),
  });

  const close = () => router.replace("/");

  // Gone, expired, or answered on another device.
  const expired =
    (request.isError && isNotFound(request.error)) ||
    (request.data && request.data.status !== "pending" && !done);

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        {done ? (
          <Outcome
            title={
              done === "shared" ? t.shareLocation.sent : t.shareLocation.declined
            }
            hint={
              done === "shared"
                ? t.shareLocation.sentHint
                : t.shareLocation.declinedHint
            }
            onClose={close}
          />
        ) : expired ? (
          <Outcome
            title={t.shareLocation.expired}
            hint={t.shareLocation.expiredHint}
            onClose={close}
          />
        ) : (
          <>
            <Text style={styles.title}>{t.shareLocation.title}</Text>
            <Text style={styles.subtitle}>{t.shareLocation.subtitle}</Text>

            <View style={styles.card}>
              {location.status === "loading" ? (
                <View style={styles.row}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.rowText}>{t.shareLocation.locating}</Text>
                </View>
              ) : location.status === "denied" ? (
                <>
                  <Text style={styles.denied}>
                    {location.error ?? t.shareLocation.noPermission}
                  </Text>
                  <Button
                    title={t.shareLocation.retry}
                    variant="ghost"
                    onPress={() => void location.refresh()}
                    style={styles.retry}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.ready}>
                    {location.coords
                      ? `${location.coords.lat.toFixed(5)}, ${location.coords.lng.toFixed(5)}`
                      : t.shareLocation.locating}
                  </Text>
                  {location.accuracy != null && (
                    <Text style={styles.accuracy}>
                      {t.shareLocation.accuracy(location.accuracy)}
                    </Text>
                  )}
                </>
              )}
            </View>

            <Text style={styles.privacy}>{t.shareLocation.privacy}</Text>

            {(share.isError || decline.isError) && (
              <Text style={styles.error}>
                {apiError(share.error ?? decline.error)}
              </Text>
            )}

            <View style={styles.actions}>
              <Button
                title={t.shareLocation.send}
                onPress={() => share.mutate()}
                loading={share.isPending}
                disabled={!location.coords || decline.isPending}
              />
              <Button
                title={t.shareLocation.decline}
                variant="ghost"
                onPress={() => decline.mutate()}
                disabled={share.isPending}
                loading={decline.isPending}
              />
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function Outcome({
  title,
  hint,
  onClose,
}: {
  title: string;
  hint: string;
  onClose: () => void;
}) {
  return (
    <View style={styles.outcome}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{hint}</Text>
      <Button
        title={t.shareLocation.close}
        onPress={onClose}
        style={styles.closeBtn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: spacing(5), justifyContent: "center" },
  outcome: { gap: spacing(2) },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    marginTop: spacing(2),
    lineHeight: 21,
  },
  card: {
    marginTop: spacing(6),
    padding: spacing(4),
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  rowText: { fontSize: 15, color: colors.muted },
  ready: { fontSize: 16, fontWeight: "600", color: colors.text },
  accuracy: { fontSize: 13, color: colors.muted, marginTop: spacing(1) },
  denied: { fontSize: 15, color: colors.danger, lineHeight: 21 },
  retry: { marginTop: spacing(3) },
  privacy: {
    fontSize: 13,
    color: colors.muted,
    marginTop: spacing(4),
    lineHeight: 19,
  },
  error: { fontSize: 14, color: colors.danger, marginTop: spacing(4) },
  actions: { marginTop: spacing(8), gap: spacing(3) },
  closeBtn: { marginTop: spacing(6) },
});
