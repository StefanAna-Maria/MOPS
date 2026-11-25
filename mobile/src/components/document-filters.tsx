import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { DOCUMENT_FILTERS, DOCUMENT_FILTER_LABELS, type DocumentFilter } from "@ocrinvoice/shared";
import { colors, radius, spacing, typography } from "@/constants/theme";

type DocumentFiltersProps = {
  value: DocumentFilter;
  onChange: (filter: DocumentFilter) => void;
};

export function DocumentFilters({ value, onChange }: DocumentFiltersProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {DOCUMENT_FILTERS.map((filter) => {
        const selected = filter === value;
        return (
          <Pressable
            key={filter}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={DOCUMENT_FILTER_LABELS[filter]}
            onPress={() => onChange(filter)}
            style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
          >
            <Text style={[styles.text, selected && styles.textSelected]}>{DOCUMENT_FILTER_LABELS[filter]}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    ...typography.label,
    color: colors.textBody,
  },
  textSelected: {
    color: colors.white,
  },
});
