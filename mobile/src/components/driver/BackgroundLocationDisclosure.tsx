import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { t } from "@/lib/strings";
import { colors, radius, spacing } from "@/theme/colors";

/**
 * Prominent disclosure for background location (Google Play User Data policy).
 * Shown BEFORE the OS permission prompt, whenever the driver first tries to go
 * online. The driver must actively accept; declining keeps them offline.
 */
export function BackgroundLocationDisclosure({
  visible,
  onAccept,
  onDecline,
}: {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const d = t.driver.home.disclosure;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDecline}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.iconWrap}>
            <Ionicons name="location" size={30} color={colors.primary} />
          </View>
          <Text style={styles.title}>{d.title}</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner}>
            <Text style={styles.body}>{d.body}</Text>
            <Text style={styles.body}>{d.body2}</Text>
            <Text style={styles.consent}>{d.consent}</Text>
          </ScrollView>
          <Pressable style={[styles.btn, styles.accept]} onPress={onAccept}>
            <Text style={styles.acceptText}>{d.accept}</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.decline]} onPress={onDecline}>
            <Text style={styles.declineText}>{d.decline}</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing(6),
    paddingTop: spacing(6),
    paddingBottom: spacing(4),
  },
  iconWrap: {
    alignSelf: "center",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(37,99,235,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing(4),
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    marginBottom: spacing(4),
  },
  scroll: { maxHeight: 320 },
  scrollInner: { gap: spacing(3) },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
  consent: { fontSize: 14, lineHeight: 21, color: colors.muted, fontWeight: "500" },
  btn: {
    height: 54,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing(3),
  },
  accept: { backgroundColor: colors.primary },
  acceptText: { fontSize: 17, fontWeight: "700", color: "#fff" },
  decline: { backgroundColor: "transparent" },
  declineText: { fontSize: 16, fontWeight: "600", color: colors.muted },
});
