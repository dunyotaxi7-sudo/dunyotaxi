import { Stack } from "expo-router";
import { PushManager } from "@/components/PushManager";

export default function PassengerLayout() {
  return (
    <>
      <PushManager />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
