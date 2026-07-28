import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { CarModelOption } from "@/lib/types";
import { SafeAreaView } from "react-native-safe-area-context";
import { driverApi } from "@/lib/api/driver";
import { apiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/strings";
import { useAuth } from "@/store/auth";
import { colors, radius, spacing } from "@/theme/colors";

// "01 A 123 BA" style plates (loose check; backend is source of truth).
const PLATE_RE = /^\d{2}\s?[A-Z]\s?\d{3}\s?[A-Z]{2}$/i;

const tierLabel = (code: string) => code.charAt(0).toUpperCase() + code.slice(1);

/** Group models by tier, preserving the server's tier→name ordering. */
function groupByTier(models: CarModelOption[]): [string, CarModelOption[]][] {
  const out: [string, CarModelOption[]][] = [];
  for (const m of models) {
    const last = out[out.length - 1];
    if (last && last[0] === m.car_type) last[1].push(m);
    else out.push([m.car_type, [m]]);
  }
  return out;
}

export function DriverRegisterForm({ onDone }: { onDone: () => void }) {
  const { signOut } = useAuth();
  const [carModel, setCarModel] = useState("");
  const [carNumber, setCarNumber] = useState("");
  const [carColor, setCarColor] = useState("");
  const [carYear, setCarYear] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const models = useQuery({
    queryKey: ["car-models"],
    queryFn: () => driverApi.carModels(),
  });

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

          {/* Model comes from the catalog — it sets the driver's tariff. */}
          <View style={styles.field}>
            <Text style={styles.label}>{t.driver.register.carModel}</Text>
            <Pressable
              style={styles.input}
              onPress={() => setPickerOpen(true)}
            >
              <Text style={carModel ? styles.pickerValue : styles.pickerPlaceholder}>
                {carModel || t.driver.register.carModelPlaceholder}
              </Text>
            </Pressable>
          </View>
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

      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.driver.register.carModel}</Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>

            {models.isLoading ? (
              <View style={styles.modalCenter}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : !models.data?.length ? (
              <Text style={styles.modelEmpty}>{t.common.notFound}</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {groupByTier(models.data).map(([tier, list]) => (
                  <View key={tier}>
                    <Text style={styles.modelGroup}>{tierLabel(tier)}</Text>
                    {list.map((m) => {
                      const active = m.name === carModel;
                      return (
                        <Pressable
                          key={m.id}
                          style={[styles.modelRow, active && styles.modelRowActive]}
                          onPress={() => {
                            setCarModel(m.name);
                            setPickerOpen(false);
                          }}
                        >
                          <Text style={[styles.modelName, active && styles.modelNameActive]}>
                            {m.name}
                          </Text>
                          {active ? (
                            <Ionicons name="checkmark" size={20} color={colors.primary} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
  // The model field is a Pressable styled like an input, so center its text.
  pickerValue: { fontSize: 16, color: colors.text, lineHeight: 48 },
  pickerPlaceholder: { fontSize: 16, color: colors.muted, lineHeight: 48 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(6),
    paddingTop: spacing(2),
    maxHeight: "75%",
  },
  modalHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing(3),
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing(2),
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  modalCenter: { paddingVertical: spacing(10), alignItems: "center" },
  modelGroup: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing(4),
    marginBottom: spacing(1),
  },
  modelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(3),
    borderRadius: radius.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modelRowActive: { backgroundColor: "#eef2ff", borderBottomColor: "transparent" },
  modelName: { fontSize: 16, color: colors.text },
  modelNameActive: { color: colors.primary, fontWeight: "600" },
  modelEmpty: { fontSize: 14, color: colors.muted, textAlign: "center", padding: spacing(8) },
});
