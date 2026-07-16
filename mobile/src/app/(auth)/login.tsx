import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authApi } from "@/lib/api/auth";
import { apiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/strings";
import { colors, radius, spacing } from "@/theme/colors";

const PHONE_RE = /^\+998\d{9}$/;

export default function LoginScreen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();
  const chosenRole = role === "driver" ? "driver" : "passenger";
  const [phone, setPhone] = useState("+998");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (p: string) => authApi.requestOtp(p),
    onSuccess: (res) => {
      router.push({
        pathname: "/otp",
        params: { phone, debug: res.debug_code ?? "", role: chosenRole },
      });
    },
    onError: (err) => setError(apiError(err)),
  });

  function onSubmit() {
    setError(null);
    const normalized = phone.trim();
    if (!PHONE_RE.test(normalized)) {
      setError(t.login.invalidPhone);
      return;
    }
    mutation.mutate(normalized);
  }

  function onChange(text: string) {
    // Keep the +998 prefix and allow only digits after it.
    let digits = text.replace(/[^\d]/g, "");
    if (digits.startsWith("998")) digits = digits.slice(3);
    setPhone("+998" + digits.slice(0, 9));
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{t.login.brand}</Text>
            <Text style={styles.subtitle}>{t.login.subtitle}</Text>
            <Pressable onPress={() => router.back()} style={styles.rolePill}>
              <Text style={styles.rolePillText}>
                {chosenRole === "driver"
                  ? t.login.asDriver
                  : t.login.asPassenger}
                {"  ·  "}
                {t.login.changeRole}
              </Text>
            </Pressable>
          </View>

          <View>
            <Text style={styles.label}>{t.login.phoneLabel}</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={onChange}
              keyboardType="phone-pad"
              placeholder="+998 90 123 45 67"
              placeholderTextColor={colors.muted}
              autoFocus
              maxLength={13}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>

          <Button
            title={t.login.sendCode}
            onPress={onSubmit}
            loading={mutation.isPending}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  container: { flex: 1, padding: spacing(6), gap: spacing(6), justifyContent: "center" },
  header: { gap: spacing(2), marginBottom: spacing(4) },
  title: { fontSize: 30, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 15, color: colors.muted },
  rolePill: {
    alignSelf: "flex-start",
    marginTop: spacing(2),
    paddingVertical: spacing(1),
    paddingHorizontal: spacing(3),
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  rolePillText: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  label: { fontSize: 13, color: colors.muted, marginBottom: spacing(2) },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    fontSize: 18,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing(2) },
});
