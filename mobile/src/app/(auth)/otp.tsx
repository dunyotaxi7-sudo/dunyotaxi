import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import { useAuth } from "@/store/auth";
import { colors, radius, spacing } from "@/theme/colors";
import { formatPhone } from "@/lib/format";
import { t } from "@/lib/strings";

const RESEND_SECONDS = 60;
const CODE_LENGTH = 6;

export default function OtpScreen() {
  const router = useRouter();
  const { phone, debug, role } = useLocalSearchParams<{
    phone: string;
    debug?: string;
    role?: string;
  }>();
  const chosenRole = role === "driver" ? "driver" : "passenger";
  const signIn = useAuth((s) => s.signIn);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const inputRef = useRef<TextInput>(null);

  // Resend countdown.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const verify = useMutation({
    // Pass the chosen role — the backend applies it only when creating a new
    // account; existing users keep their current role.
    mutationFn: (c: string) => authApi.verifyOtp(phone, c, undefined, chosenRole),
    onSuccess: async (tokens) => {
      // Start in the app they picked. A brand-new driver has no profile yet, so
      // we can't infer this from the user — the driver stack's gate takes them
      // to registration. Setting the user flips the auth guard.
      await signIn(tokens, chosenRole === "driver" ? "driver" : "passenger");
    },
    onError: (err) => {
      setError(apiError(err));
      setCode("");
    },
  });

  const resend = useMutation({
    mutationFn: () => authApi.requestOtp(phone),
    onSuccess: () => setSecondsLeft(RESEND_SECONDS),
    onError: (err) => setError(apiError(err)),
  });

  function onChangeCode(text: string) {
    const digits = text.replace(/[^\d]/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    setError(null);
    if (digits.length === CODE_LENGTH) verify.mutate(digits);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{t.otp.title}</Text>
            <Text style={styles.subtitle}>
              {t.otp.subtitle(formatPhone(phone))}
            </Text>
            {debug ? (
              <Text style={styles.debug}>{t.otp.testCode(debug)}</Text>
            ) : null}
          </View>

          {/* Boxes overlaying a hidden input. */}
          <Pressable onPress={() => inputRef.current?.focus()}>
            <View style={styles.boxes}>
              {Array.from({ length: CODE_LENGTH }).map((_, i) => (
                <View
                  key={i}
                  style={[styles.box, i === code.length && styles.boxActive]}
                >
                  <Text style={styles.boxText}>{code[i] ?? ""}</Text>
                </View>
              ))}
            </View>
            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={onChangeCode}
              keyboardType="number-pad"
              maxLength={CODE_LENGTH}
              autoFocus
              style={styles.hiddenInput}
            />
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            title={t.otp.verify}
            onPress={() => code.length === CODE_LENGTH && verify.mutate(code)}
            loading={verify.isPending}
            disabled={code.length !== CODE_LENGTH}
          />

          <View style={styles.resendRow}>
            {secondsLeft > 0 ? (
              <Text style={styles.resendMuted}>{t.otp.resendIn(secondsLeft)}</Text>
            ) : (
              <Pressable onPress={() => resend.mutate()} disabled={resend.isPending}>
                <Text style={styles.resendLink}>{t.otp.resend}</Text>
              </Pressable>
            )}
          </View>

          <Pressable onPress={() => router.back()}>
            <Text style={styles.changeNumber}>{t.otp.changeNumber}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  container: { flex: 1, padding: spacing(6), gap: spacing(6), justifyContent: "center" },
  header: { gap: spacing(2) },
  title: { fontSize: 26, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 15, color: colors.muted },
  debug: { fontSize: 13, color: colors.primary, marginTop: spacing(1) },
  boxes: { flexDirection: "row", gap: spacing(2), justifyContent: "space-between" },
  box: {
    flex: 1,
    height: 58,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  boxActive: { borderColor: colors.primary, borderWidth: 2 },
  boxText: { fontSize: 24, fontWeight: "700", color: colors.text },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  error: { color: colors.danger, fontSize: 13 },
  resendRow: { alignItems: "center" },
  resendMuted: { color: colors.muted, fontSize: 14 },
  resendLink: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  changeNumber: { color: colors.muted, fontSize: 14, textAlign: "center" },
});
