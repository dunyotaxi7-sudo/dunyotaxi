import { Alert } from "react-native";
import { t } from "@/lib/strings";

/**
 * Confirm before ending the session. Signing out is destructive here — getting
 * back in needs an SMS code, and for a driver it ends the shift — so it should
 * never happen on a single stray tap. Shared so both profiles behave alike.
 */
export function confirmLogout(onConfirm: () => void | Promise<void>) {
  Alert.alert(t.profile.logoutConfirmTitle, t.profile.logoutConfirmBody, [
    { text: t.common.cancel, style: "cancel" },
    {
      text: t.profile.logout,
      style: "destructive",
      onPress: () => void onConfirm(),
    },
  ]);
}
