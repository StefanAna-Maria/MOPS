import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radius, spacing, typography } from "@/constants/theme";

type SettingsSectionProps = {
  title: string;
  children: ReactNode;
};

/** A titled group of rows on the Setări screen. */
export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

type SettingsRowProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value?: string;
  /** Without it the row only shows information. */
  onPress?: () => void;
  last?: boolean;
};

export function SettingsRow({ icon, label, value, onPress, last }: SettingsRowProps) {
  const content = (
    <>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.label}>{label}</Text>
      {value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} /> : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.row, !last && styles.divider]} accessible accessibilityLabel={`${label}: ${value ?? ""}`}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    fontSize: 12,
    letterSpacing: 0.6,
    color: colors.textSecondary,
  },
  group: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.background,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: radius.base,
    backgroundColor: colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...typography.bodyLg,
    flex: 1,
    color: colors.textPrimary,
  },
  value: {
    ...typography.bodyMd,
    maxWidth: "50%",
    color: colors.textSecondary,
  },
});
