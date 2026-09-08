import { Stack } from "expo-router";
import { PushManager } from "@/components/PushManager";
// Side-effect import: registers the background-location TaskManager task as
// early as the driver area mounts.
import "@/lib/backgroundLocation";

export default function DriverLayout() {
  return (
    <>
      <PushManager />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
