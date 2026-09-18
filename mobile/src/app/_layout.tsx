import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useAuth } from "@/store/auth";
import { colors } from "@/theme/colors";

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  const { user, mode, hydrated, hydrate } = useAuth();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Wait for SecureStore before deciding which stack to show (avoids a flash of
  // the login screen for already-authenticated users).
  if (!hydrated) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // One number, one purpose: an account that drives cannot also ride, so an
  // account with a driver profile stays in the driver app and has no passenger
  // mode to switch to. The server enforces the same rule — it refuses a ride
  // request from a number that drives — and this keeps the app from offering
  // what the API would reject.
  //
  // `mode === "driver"` still counts on its own so a newcomer without a profile
  // yet can enter the driver stack, whose gate walks them through
  // registration → documents → approval.
  const signedIn = Boolean(user);
  const isDriver = signedIn && (mode === "driver" || Boolean(user?.is_driver));
  const isPassenger = signedIn && !isDriver;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <OfflineBanner />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={!user}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={isPassenger}>
            <Stack.Screen name="(passenger)" />
          </Stack.Protected>
          <Stack.Protected guard={isDriver}>
            <Stack.Screen name="(driver)" />
          </Stack.Protected>
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
});
