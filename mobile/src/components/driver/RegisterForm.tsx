import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { driverApi } from "@/lib/api/driver";
import { apiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/strings";
import { useAuth } from "@/store/auth";
import { colors, radius, spacing } from "@/theme/colors";

// "01 A 123 BA" style plates (loose check; backend is source of truth).
const PLATE_RE = /^\d{2}\s?[A-Z]\s?\d{3}\s?[A-Z]{2}$/i;

export function DriverRegisterForm({ onDone }: { onDone: () => void }) {
  const { signOut } = useAuth();
  const [carModel, setCarModel] = useState("");
  const [carNumber, setCarNumber] = useState("");
  const [carColor, setCarColor] = useState("");
  const [carYear, setCarYear] = useState("");
  const [error, setError] = useState<string | null>(null);

  const register = useMutation({
    mutationFn: () =>
      driverApi.register({
        car_model: carModel.trim(),
        car_number: carNumber.trim().toUpperCase(),
        car_color: carColor.trim() || undefined,
        car_year: carYear ? Number(carYear) : undefined,
      }),
    onSuccess: () => onDone(),
    onError: (e) => setError(apiError(e)),
  });

  function submit() {
    setError(null);
    if (!carModel.trim()) return setError(t.driver.register.carModel);
    if (!PLATE_RE.test(carNumber.trim())) {
      return setError(t.driver.register.carNumberInvalid);
    }
    register.mutate();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{t.driver.register.title}</Text>
          <Text style={styles.subtitle}>{t.driver.register.subtitle}</Text>

          <Field
            label={t.driver.register.carModel}
            value={carModel}
            onChangeText={setCarModel}
            placeholder={t.driver.register.carModelPlaceholder}
          />
          <Field
            label={t.driver.register.carNumber}
            value={carNumber}
            onChangeText={setCarNumber}
            placeholder={t.driver.register.carNumberPlaceholder}
            autoCapitalize="characters"
          />
          <Field
            label={t.driver.register.carColor}
            value={carColor}
            onChangeText={setCarColor}
            placeholder={t.driver.register.carColorPlaceholder}
          />
          <Field
            label={t.driver.register.carYear}
            value={carYear}
            onChangeText={(v) => setCarYear(v.replace(/[^\d]/g, "").slice(0, 4))}
            placeholder={t.driver.register.carYearPlaceholder}
            keyboardType="number-pad"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            title={t.driver.register.submit}
            onPress={submit}
            loading={register.isPending}
            style={{ marginTop: spacing(4) }}
          />

          {/* Escape hatch: there's no in-app mode switch, so backing out of
              driver registration means signing out and choosing again. */}
          <Pressable onPress={() => void signOut()} style={styles.backToPassenger}>
            <Text style={styles.backToPassengerText}>{t.driver.pending.logout}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.muted}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  container: { padding: spacing(6), gap: spacing(1) },
  title: { fontSize: 26, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 15, color: colors.muted, marginBottom: spacing(4) },
  field: { marginTop: spacing(3) },
  label: { fontSize: 13, color: colors.muted, marginBottom: spacing(1) },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3),
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing(3) },
  backToPassenger: { alignItems: "center", paddingVertical: spacing(4) },
  backToPassengerText: { color: colors.muted, fontSize: 14, fontWeight: "600" },
});
