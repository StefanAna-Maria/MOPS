import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "@/constants/theme";

type SheetOptionProps = {
  title: string;
  subtitle?: string;
  selected?: boolean;
  tone?: "default" | "action" | "danger";
  onPress: () => void;
};

export function SheetOption({ title, subtitle, selected, tone = "default", onPress }: SheetOptionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}
    >
      <View style={styles.texts}>
        <Text style={[styles.title, tone === "action" && styles.action, tone === "danger" && styles.danger]}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {selected ? <Text style={styles.check}>✓</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  pressed: {
    opacity: 0.85,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.headlineSm,
    color: colors.textPrimary,
  },
  action: {
    color: colors.primary,
  },
  danger: {
    color: colors.error,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  check: {
    ...typography.headlineSm,
    color: colors.primary,
  },
});
