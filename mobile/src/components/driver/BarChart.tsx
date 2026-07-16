import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/colors";

/** Minimal dependency-free vertical bar chart. */
export function BarChart({
  data,
  height = 130,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={[styles.row, { height: height + 20 }]}>
      {data.map((d, i) => (
        <View key={i} style={styles.col}>
          <View
            style={[
              styles.bar,
              { height: Math.max(2, (d.value / max) * height) },
            ]}
          />
          <Text style={styles.label} numberOfLines={1}>
            {d.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  col: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  bar: { width: "68%", backgroundColor: colors.primary, borderRadius: 4 },
  label: { fontSize: 9, color: colors.muted, marginTop: 4 },
});
