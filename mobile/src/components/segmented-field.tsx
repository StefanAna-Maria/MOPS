import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "@/constants/theme";

type SegmentedFieldProps<T extends string> = {
  label: string;
  value: T | null;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
};

export function SegmentedField<T extends string>({ label, value, options, labels, onChange }: SegmentedFieldProps<T>) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => {
          const selected = option === value;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option)}
              style={({ pressed }) => [styles.segment, selected && styles.selected, pressed && styles.pressed]}
            >
              <Text style={[styles.text, selected && styles.selectedText]}>{labels[option]}</Text>
            </Pressable>
          );
        })}
      </View>
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
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  segment: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  pressed: {
    opacity: 0.85,
  },
  text: {
    ...typography.label,
    color: colors.textBody,
  },
  selectedText: {
    color: colors.primary,
  },
});
