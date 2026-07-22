import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { driverApi } from "@/lib/api/driver";
import { apiError } from "@/lib/api/client";
import { Badge } from "@/components/driver/Badge";
import { useAuth } from "@/store/auth";
import { t } from "@/lib/strings";
import type { DocStatus, DocType, DriverDocument, DriverProfile } from "@/lib/types";
import { colors, radius, spacing } from "@/theme/colors";

const DOC_ORDER: DocType[] = [
  "passport",
  "tech_passport",
  "car_photo_front",
  "car_photo_back",
];

export function DriverOnboarding({ driver }: { driver: DriverProfile }) {
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const [uploading, setUploading] = useState<Record<string, number | undefined>>({});

  const docsQuery = useQuery({
    queryKey: ["driver-documents"],
    queryFn: () => driverApi.documents(),
    refetchInterval: 5000, // catch admin review updates
  });
  const docs = docsQuery.data ?? [];

  // Latest document for each type.
  const byType = (type: DocType): DriverDocument | undefined =>
    docs
      .filter((d) => d.doc_type === type)
      .sort((a, b) => (a.uploaded_at ?? "").localeCompare(b.uploaded_at ?? ""))
      .at(-1);

  const upload = useMutation({
    mutationFn: ({ type, uri }: { type: DocType; uri: string }) =>
      driverApi.uploadDocument(type, uri, (pct) =>
        setUploading((u) => ({ ...u, [type]: pct })),
      ),
    onSettled: (_d, _e, vars) => {
      setUploading((u) => ({ ...u, [vars.type]: undefined }));
      qc.invalidateQueries({ queryKey: ["driver-documents"] });
    },
    onError: (e) => Alert.alert("Xatolik", apiError(e)),
  });

  async function pickAndUpload(type: DocType) {
    Alert.alert(t.driver.docTypes[type], undefined, [
      {
        text: t.driver.docs.takePhoto,
        onPress: () => launch(type, "camera"),
      },
      {
        text: t.driver.docs.pickFromLibrary,
        onPress: () => launch(type, "library"),
      },
      { text: t.driver.docs.cancel, style: "cancel" },
    ]);
  }

  async function launch(type: DocType, source: "camera" | "library") {
    const perm =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t.driver.docs.permissionNeeded);
      return;
    }
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ quality: 0.6, mediaTypes: ["images"] })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ["images"] });
    if (result.canceled || !result.assets?.[0]) return;
    upload.mutate({ type, uri: result.assets[0].uri });
  }

  const anyRejected = docs.some((d) => d.status === "rejected") || driver.status === "rejected";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>
          {anyRejected ? t.driver.pending.rejectedTitle : t.driver.docs.title}
        </Text>
        <Text style={styles.subtitle}>
          {anyRejected ? t.driver.pending.rejectedSubtitle : t.driver.docs.subtitle}
        </Text>

        <View style={styles.list}>
          {DOC_ORDER.map((type) => {
            const doc = byType(type);
            const pct = uploading[type];
            const busy = pct !== undefined;
            return (
              <View key={type} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docName}>{t.driver.docTypes[type]}</Text>
                  {doc ? (
                    <View style={styles.statusLine}>
                      <Badge status={doc.status as DocStatus} />
                      {doc.status === "rejected" && doc.reject_reason ? (
                        <Text style={styles.reason} numberOfLines={1}>
                          {doc.reject_reason}
                        </Text>
                      ) : null}
                    </View>
                  ) : (
                    <Text style={styles.notUploaded}>—</Text>
                  )}
                </View>
                <Pressable
                  style={[styles.btn, busy && styles.btnBusy]}
                  disabled={busy}
                  onPress={() => pickAndUpload(type)}
                >
                  <Text style={styles.btnText}>
                    {busy
                      ? `${pct}%`
                      : doc
                        ? t.driver.docs.change
                        : t.driver.docs.upload}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* Pending banner */}
        <View style={styles.pendingCard}>
          <Text style={styles.pendingTitle}>{t.driver.pending.title}</Text>
          <Text style={styles.pendingSub}>{t.driver.pending.subtitle}</Text>
          <Text style={styles.checking}>{t.driver.pending.checking}</Text>
        </View>

        <Pressable onPress={() => void signOut()} style={styles.logout}>
          <Text style={styles.logoutText}>{t.driver.pending.logout}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing(6) },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: spacing(1), marginBottom: spacing(5) },
  list: { gap: spacing(3) },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(4),
    backgroundColor: colors.surface,
  },
  docName: { fontSize: 15, fontWeight: "600", color: colors.text },
  statusLine: { flexDirection: "row", alignItems: "center", gap: spacing(2), marginTop: spacing(1) },
  reason: { fontSize: 12, color: colors.danger, flexShrink: 1 },
  notUploaded: { fontSize: 13, color: colors.muted, marginTop: spacing(1) },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2),
    minWidth: 84,
    alignItems: "center",
  },
  btnBusy: { backgroundColor: colors.muted },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  pendingCard: {
    marginTop: spacing(6),
    backgroundColor: "#eef4ff",
    borderRadius: radius.md,
    padding: spacing(4),
  },
  pendingTitle: { fontSize: 16, fontWeight: "700", color: colors.primary },
  pendingSub: { fontSize: 14, color: colors.text, marginTop: spacing(1), lineHeight: 20 },
  checking: { fontSize: 12, color: colors.muted, marginTop: spacing(2) },
  logout: { alignItems: "center", marginTop: spacing(6) },
  logoutText: { color: colors.muted, fontSize: 15 },
});
