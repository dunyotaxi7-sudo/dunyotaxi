import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authApi } from "@/lib/api/auth";
import { apiError } from "@/lib/api/client";
import { driverApi } from "@/lib/api/driver";
import { Button } from "@/components/ui/Button";
import { confirmLogout } from "@/lib/confirmLogout";
import { formatPhone } from "@/lib/format";
import { t } from "@/lib/strings";
import { useAuth } from "@/store/auth";
import { colors, radius, spacing } from "@/theme/colors";

/**
 * The driver's own account + vehicle details. Name is editable (same endpoint
 * as the passenger profile); everything else is set at registration or earned,
 * so it's read-only here — car changes go through an admin.
 */
export default function DriverProfileScreen() {
  const router = useRouter();
  const { user, updateUser, signOut } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.full_name ?? "");

  const me = useQuery({ queryKey: ["driver-me"], queryFn: () => driverApi.me() });

  const save = useMutation({
    mutationFn: () => authApi.updateMe(name.trim()),
    onSuccess: async (updated) => {
      await updateUser(updated);
      setEditing(false);
    },
  });

  const d = me.data;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{t.driver.profile.title}</Text>
        </View>

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.full_name ?? "?").charAt(0).toUpperCase()}
          </Text>
        </View>

        {/* Name — editable */}
        <Text style={styles.label}>{t.profile.name}</Text>
        {editing ? (
          <>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              autoFocus
              maxLength={100}
            />
            {save.isError ? <Text style={styles.err}>{apiError(save.error)}</Text> : null}
            <View style={styles.editBtns}>
              <Button
                title={t.common.save}
                onPress={() => save.mutate()}
                loading={save.isPending}
                disabled={!name.trim()}
                style={{ flex: 1 }}
              />
              <Button
                title={t.common.cancel}
                variant="ghost"
                onPress={() => {
                  setName(user?.full_name ?? "");
                  setEditing(false);
                }}
                style={{ flex: 1 }}
              />
            </View>
          </>
        ) : (
          <Pressable style={styles.valueRow} onPress={() => setEditing(true)}>
            <Text style={styles.value}>{user?.full_name}</Text>
            <Text style={styles.editLink}>{t.profile.edit}</Text>
          </Pressable>
        )}

        <Row label={t.profile.phone} value={formatPhone(user?.phone)} />

        {d ? (
          <>
            <Text style={styles.section}>{t.driver.profile.car}</Text>
            <Row label={t.driver.profile.car} value={d.car_model} />
            <Row label={t.driver.profile.carNumber} value={d.car_number} />
            {d.car_color ? (
              <Row label={t.driver.profile.carColor} value={d.car_color} />
            ) : null}
            {d.car_year ? (
              <Row label={t.driver.profile.carYear} value={String(d.car_year)} />
            ) : null}

            <Text style={styles.section}>{t.driver.profile.status}</Text>
            <Row
              label={t.driver.profile.status}
              value={t.driver.docStatus[d.status] ?? d.status}
            />
            <Row label={t.driver.profile.rating} value={`★ ${d.rating}`} />
            <Row label={t.driver.profile.totalRides} value={String(d.total_rides)} />
          </>
        ) : null}

        <Button
          title={t.profile.logout}
          variant="ghost"
          onPress={() =>
            confirmLogout(async () => {
              await signOut();
              router.replace("/");
            })
          }
          style={{ marginTop: spacing(8) }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value ?? "—"}</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing(6), paddingBottom: spacing(10) },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(4),
    marginBottom: spacing(6),
  },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  avatar: {
    alignSelf: "center",
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing(6),
  },
  avatarText: { fontSize: 34, fontWeight: "700", color: colors.primary },
  section: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing(7),
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  label: { fontSize: 13, color: colors.muted, marginTop: spacing(4), marginBottom: spacing(1) },
  valueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  value: { fontSize: 16, color: colors.text },
  editLink: { fontSize: 14, color: colors.primary, fontWeight: "500" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(3),
    fontSize: 16,
    color: colors.text,
  },
  editBtns: { flexDirection: "row", gap: spacing(2), marginTop: spacing(3) },
  err: { color: colors.danger, fontSize: 13, marginTop: spacing(2) },
});
