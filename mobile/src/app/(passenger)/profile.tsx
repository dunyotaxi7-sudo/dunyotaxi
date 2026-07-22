import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authApi } from "@/lib/api/auth";
import { apiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { confirmLogout } from "@/lib/confirmLogout";
import { formatPhone } from "@/lib/format";
import { t } from "@/lib/strings";
import { useAuth } from "@/store/auth";
import { colors, radius, spacing } from "@/theme/colors";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, updateUser, signOut } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.full_name ?? "");

  const save = useMutation({
    mutationFn: () => authApi.updateMe(name.trim()),
    onSuccess: async (updated) => {
      await updateUser(updated);
      setEditing(false);
    },
  });

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{t.profile.title}</Text>
        </View>

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.full_name ?? "?").charAt(0).toUpperCase()}
          </Text>
        </View>

        {/* Name */}
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

        {/* Phone (read-only) */}
        <Text style={styles.label}>{t.profile.phone}</Text>
        <View style={styles.valueRow}>
          <Text style={styles.value}>{formatPhone(user?.phone)}</Text>
        </View>

        <View style={{ flex: 1 }} />
        <Button
          title={t.profile.logout}
          variant="ghost"
          onPress={() =>
            confirmLogout(async () => {
              await signOut();
              router.replace("/");
            })
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: spacing(6) },
  header: { flexDirection: "row", alignItems: "center", gap: spacing(4), marginBottom: spacing(6) },
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
