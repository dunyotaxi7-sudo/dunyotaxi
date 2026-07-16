import { Stack } from "expo-router";
// Side-effect import: registers the background-location TaskManager task as
// early as the driver area mounts.
import "@/lib/backgroundLocation";

export default function DriverLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
