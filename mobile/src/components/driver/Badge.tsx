import { StyleSheet, Text, View } from "react-native";
import { t } from "@/lib/strings";
import type { DocStatus } from "@/lib/types";
import { colors } from "@/theme/colors";

const TONE: Record<DocStatus, { bg: string; fg: string }> = {
  approved: { bg: "#e7f6ec", fg: colors.success },
  rejected: { bg: "#fdecec", fg: colors.danger },
  pending: { bg: "#fff5e6", fg: "#b45309" },
};

export function Badge({ status }: { status: DocStatus }) {
  const tone = TONE[status];
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>
        {t.driver.docStatus[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  text: { fontSize: 11, fontWeight: "600" },
});
