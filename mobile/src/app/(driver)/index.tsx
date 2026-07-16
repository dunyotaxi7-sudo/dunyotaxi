import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { driverApi } from "@/lib/api/driver";
import { apiError, isNotFound } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { DriverRegisterForm } from "@/components/driver/RegisterForm";
import { DriverOnboarding } from "@/components/driver/Onboarding";
import { DriverHome } from "@/components/driver/DriverHome";
import { t } from "@/lib/strings";
import { colors, spacing } from "@/theme/colors";

/**
 * Entry point for the driver. Routes by onboarding state:
 *   no profile          → registration form
 *   status ≠ approved   → document upload + pending approval (polls)
 *   status = approved   → main home (Stage 2)
 */
export default function DriverGate() {
  const me = useQuery({
    queryKey: ["driver-me"],
    queryFn: () => driverApi.me(),
    retry: (count, err) => !isNotFound(err) && count < 2,
    // Keep polling while unapproved so approval flips the UI automatically.
    refetchInterval: (q) =>
      q.state.data && q.state.data.status !== "approved" ? 5000 : false,
  });

  if (me.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // No driver profile yet → register.
  if (me.isError && isNotFound(me.error)) {
    return <DriverRegisterForm onDone={() => me.refetch()} />;
  }
  if (me.isError) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.err}>{apiError(me.error)}</Text>
        <Button title={t.common.retry} variant="ghost" onPress={() => me.refetch()} />
      </SafeAreaView>
    );
  }

  const driver = me.data!;
  if (driver.status !== "approved") {
    return <DriverOnboarding driver={driver} />;
  }
  return <DriverHome driver={driver} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(3),
    backgroundColor: colors.bg,
  },
  err: { color: colors.danger, fontSize: 14, textAlign: "center", paddingHorizontal: spacing(6) },
});
