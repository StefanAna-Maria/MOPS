import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { SheetOption } from "@/components/sheet-option";
import { colors, radius, spacing, typography } from "@/constants/theme";

type SelectFieldProps<T extends string> = {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
};

export function SelectField<T extends string>({ label, value, options, labels, onChange }: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${labels[value]}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.box, pressed && styles.pressed]}
      >
        <Text style={styles.value}>{labels[value]}</Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      <BottomSheet visible={open} title={label} onClose={() => setOpen(false)}>
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {options.map((option) => (
            <SheetOption
              key={option}
              title={labels[option]}
              selected={option === value}
              onPress={() => {
                onChange(option);
                setOpen(false);
              }}
            />
          ))}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    ...typography.label,
    color: colors.textBody,
  },
  box: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.85,
  },
  value: {
    ...typography.bodyLg,
    flex: 1,
    color: colors.textPrimary,
  },
  chevron: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  list: {
    maxHeight: 480,
  },
  listContent: {
    gap: spacing.sm,
  },
});
