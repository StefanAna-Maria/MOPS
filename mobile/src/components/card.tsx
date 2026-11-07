import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { elevation, radius, spacing } from "@/constants/theme";

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    ...elevation.level1,
    borderRadius: radius.base,
    padding: spacing.lg,
    gap: spacing.lg,
  },
});
