import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radius } from "@/theme/colors";

export function Skeleton({
  height = 16,
  width = "100%",
  style,
}: {
  height?: number;
  width?: number | `${number}%`;
  style?: ViewStyle;
}) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[{ height, width, opacity }, styles.base, style]}
    />
  );
}

/** A card-shaped skeleton row, e.g. for list placeholders. */
export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <Skeleton width="40%" height={12} />
      <Skeleton width="80%" height={14} style={{ marginTop: 10 }} />
      <Skeleton width="60%" height={14} style={{ marginTop: 6 }} />
      <Skeleton width="30%" height={16} style={{ marginTop: 10 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.border, borderRadius: radius.sm },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 16,
    backgroundColor: colors.surface,
  },
});
