import { StyleSheet, Text } from "react-native";
import { DESCRIPTION_MAX_LENGTH, NOTE_MAX_LENGTH, PAYMENT_METHODS } from "@ocrinvoice/shared";
import { CategoryField } from "@/components/category-field";
import { DateTimeField } from "@/components/date-time-field";
import { SegmentedField } from "@/components/segmented-field";
import { TextField } from "@/components/text-field";
import type { ExpenseForm } from "@/lib/use-expense-form";
import { colors, spacing, typography } from "@/constants/theme";
import { useT } from "@/i18n";

type ExpenseFormFieldsProps = {
  form: ExpenseForm;
  /** "Pentru ce ai plătit?" when adding an expense, "Magazin" when correcting a document. */
  descriptionLabel: string;
  placeholder?: string;
};

/** The fields of an expense (US-03 adds one, US-13 corrects one): merchant, amount, date, category, payment, note. */
export function ExpenseFormFields({ form, descriptionLabel, placeholder }: ExpenseFormFieldsProps) {
  const t = useT();
  return (
    <>
      <TextField
        label={descriptionLabel}
        value={form.description}
        onChangeText={form.setDescription}
        onBlur={form.touch("description")}
        placeholder={placeholder}
        maxLength={DESCRIPTION_MAX_LENGTH}
        error={form.errorFor("description")}
      />
      <TextField
        label={t.expense.amount}
        value={form.amount}
        onChangeText={form.setAmount}
        onBlur={form.touch("amount")}
        placeholder="0,00"
        keyboardType="decimal-pad"
        accessory={<Text style={styles.currency}>{t.common.currency}</Text>}
        error={form.errorFor("amount")}
      />
      {/* US-03: a calendar to pick the date (no future dates). */}
      <DateTimeField
        label={t.expense.date}
        mode="date"
        value={form.date}
        onChange={(value) => {
          form.setDate(value);
          form.touch("date")();
        }}
        maximumDate={new Date()}
        placeholder="ZZ.LL.AAAA"
        error={form.errorFor("date")}
      />
      <CategoryField
        value={form.category}
        categories={form.categories}
        onChange={form.setCategory}
        onCategoriesChange={form.setCategories}
      />
      <SegmentedField
        label={t.expense.payment}
        value={form.paymentMethod}
        options={PAYMENT_METHODS}
        labels={t.payments}
        onChange={form.setPaymentMethod}
      />
      <TextField
        label={t.expense.note}
        value={form.note}
        onChangeText={form.setNote}
        maxLength={NOTE_MAX_LENGTH}
        multiline
      />
    </>
  );
}

const styles = StyleSheet.create({
  currency: {
    ...typography.bodyLg,
    paddingRight: spacing.lg,
    color: colors.textSecondary,
  },
});
