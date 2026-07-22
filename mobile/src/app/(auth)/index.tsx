import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { t } from "@/lib/strings";
import { colors, radius, spacing } from "@/theme/colors";

// First screen: the user picks whether they're a passenger or a driver. The
// choice is carried to login → otp → verify-otp, where it sets the role on
// first account creation. Existing accounts keep their role regardless.
export default function RoleSelectScreen() {
  const router = useRouter();

  function choose(role: "passenger" | "driver") {
    router.push({ pathname: "/login", params: { role } });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.brand}>{t.login.brand}</Text>
          <Text style={styles.title}>{t.roleSelect.title}</Text>
          <Text style={styles.subtitle}>{t.roleSelect.subtitle}</Text>
        </View>

        <View style={styles.cards}>
          <RoleCard
            icon="person-outline"
            title={t.roleSelect.passenger}
            hint={t.roleSelect.passengerHint}
            onPress={() => choose("passenger")}
          />
          <RoleCard
            icon="car-outline"
            title={t.roleSelect.driver}
            hint={t.roleSelect.driverHint}
            onPress={() => choose("driver")}
          />
        </View>

        <Text style={styles.note}>{t.roleSelect.note}</Text>
      </View>
    </SafeAreaView>
  );
}

// Icons are deliberately monochrome outlines tinted from the palette — colour
// is reserved for state (press, errors), never decoration.
function RoleCard({
  icon,
  title,
  hint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${hint}`}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={22} color={colors.text} />
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardHint}>{hint}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: spacing(6), justifyContent: "center", gap: spacing(9) },
  header: { gap: spacing(1) },
  brand: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.6,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
    marginTop: spacing(5),
  },
  subtitle: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  cards: { gap: spacing(3) },
  // White cards defined by a hairline border rather than a grey fill: the tint
  // is then free to signal the pressed state.
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(4),
    paddingVertical: spacing(4),
    paddingHorizontal: spacing(4),
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  cardPressed: { borderColor: colors.text, backgroundColor: colors.surface },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 16, fontWeight: "600", color: colors.text },
  cardHint: { fontSize: 13, color: colors.muted },
  note: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 17,
    paddingHorizontal: spacing(4),
  },
});
