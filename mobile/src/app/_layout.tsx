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

  // One account can be both. Which app shows is the user's chosen mode — not a
  // fixed role. Driver mode is reachable by anyone: the driver stack's gate
  // walks newcomers through registration → documents → approval.
  const signedIn = Boolean(user);
  const isDriver = signedIn && mode === "driver";
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
