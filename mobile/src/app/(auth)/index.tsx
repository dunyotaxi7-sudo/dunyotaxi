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
            emoji="🧍"
            title={t.roleSelect.passenger}
            hint={t.roleSelect.passengerHint}
            onPress={() => choose("passenger")}
          />
          <RoleCard
            emoji="🚗"
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

function RoleCard({
  emoji,
  title,
  hint,
  onPress,
}: {
  emoji: string;
  title: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.iconWrap}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardHint}>{hint}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: spacing(6), justifyContent: "center", gap: spacing(8) },
  header: { gap: spacing(2) },
  brand: { fontSize: 30, fontWeight: "700", color: colors.text },
  title: { fontSize: 20, fontWeight: "600", color: colors.text, marginTop: spacing(2) },
  subtitle: { fontSize: 15, color: colors.muted },
  cards: { gap: spacing(4) },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(4),
    padding: spacing(5),
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardPressed: { borderColor: colors.primary, backgroundColor: colors.bg },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 28 },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 18, fontWeight: "600", color: colors.text },
  cardHint: { fontSize: 14, color: colors.muted },
  chevron: { fontSize: 28, color: colors.muted, fontWeight: "300" },
  note: { fontSize: 13, color: colors.muted, textAlign: "center" },
});
