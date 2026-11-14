import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ExpenseDocument } from "@ocrinvoice/shared";
import { amountToCents, documentSubtitle, formatLei } from "@/lib/expense-list";
import { colors, radius, spacing, typography } from "@/constants/theme";

type ExpenseRowProps = {
  document: ExpenseDocument;
  first: boolean;
  last: boolean;
  onPress: () => void;
};

export function ExpenseRow({ document, first, last, onPress }: ExpenseRowProps) {
  const subtitle = documentSubtitle(document);
  const amount = formatLei(amountToCents(document.total));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${document.merchant}, ${subtitle}, ${amount}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        first && styles.first,
        last && styles.last,
        !last && styles.divider,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.texts}>
        <Text style={styles.merchant} numberOfLines={1}>
          {document.merchant}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Text style={styles.amount}>{amount}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
  first: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.base,
    borderTopRightRadius: radius.base,
  },
  last: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.base,
    borderBottomRightRadius: radius.base,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.background,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  merchant: {
    ...typography.headlineSm,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  amount: {
    ...typography.label,
    fontSize: 15,
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
});
