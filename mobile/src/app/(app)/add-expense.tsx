import { useRef, useState } from "react";
import { Alert, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import {
  DEFAULT_EXPENSE_CATEGORY,
  DEFAULT_PAYMENT_METHOD,
  DESCRIPTION_MAX_LENGTH,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  NOTE_MAX_LENGTH,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  formatDisplayDate,
  isDescriptionValid,
  isPaymentDateValid,
  parseAmount,
  parseDisplayDate,
  type ExpenseCategory,
  type PaymentMethod,
} from "@ocrinvoice/shared";
import { Screen } from "@/components/screen";
import { Card } from "@/components/card";
import { TextField } from "@/components/text-field";
import { SelectField } from "@/components/select-field";
import { SegmentedField } from "@/components/segmented-field";
import { PrimaryButton } from "@/components/primary-button";
import { TextLink } from "@/components/text-link";
import { apiFetch } from "@/lib/api";
import { showServerUnavailable } from "@/lib/alerts";
import { localTodayIso } from "@/lib/dates";
import { useProfile } from "@/lib/profile-context";
import { EXPENSE_MESSAGES } from "@/lib/expense-messages";
import { createRequestId } from "@/lib/request-id";
import { colors, spacing, typography } from "@/constants/theme";

type Field = "description" | "amount" | "date";

export default function AddExpenseScreen() {
  const { activeContext, company } = useProfile();
  // The expense goes to the profile selected on Acasă (personal or company), and is shown only there.
  const profileName = activeContext === "company" && company ? company.name : "Personal";
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => formatDisplayDate(localTodayIso()));
  const [category, setCategory] = useState<ExpenseCategory>(DEFAULT_EXPENSE_CATEGORY);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(DEFAULT_PAYMENT_METHOD);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState<Record<Field, boolean>>({ description: false, amount: false, date: false });
  const [loading, setLoading] = useState(false);

  // One id per expense: a retry after a timeout reuses it, so the server saves the expense only once (CA-03.6).
  const requestId = useRef(createRequestId());
  const submitting = useRef(false);

  const normalizedAmount = parseAmount(amount);
  const isoDate = parseDisplayDate(date);
  const valid = {
    description: isDescriptionValid(description),
    amount: normalizedAmount !== null,
    date: isPaymentDateValid(isoDate, localTodayIso()),
  };
  const canSubmit = valid.description && valid.amount && valid.date;

  const touch = (field: Field) => () => setTouched((previous) => ({ ...previous, [field]: true }));
  const errorFor = (field: Field) => (touched[field] && !valid[field] ? EXPENSE_MESSAGES[field] : null);

  async function handleSubmit() {
    if (!canSubmit || submitting.current) {
      return;
    }
    submitting.current = true;
    setLoading(true);
    try {
      const response = await apiFetch("/api/documents/manual", {
        method: "POST",
        body: JSON.stringify({
          clientRequestId: requestId.current,
          context: activeContext,
          description: description.trim(),
          amount: normalizedAmount,
          date: isoDate,
          category,
          paymentMethod,
          note: note.trim(),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.code === "INVALID_EXPENSE" && Array.isArray(data.fields)) {
          setTouched({ description: true, amount: true, date: true });
        }
        Alert.alert("Nu am putut salva cheltuiala", "Verifică datele și încearcă din nou.");
        return;
      }
      router.back();
    } catch {
      showServerUnavailable();
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <Screen title="Adaugă o cheltuială" subtitle={`Pentru plățile fără bon. Se salvează în: ${profileName}.`}>
      <Card>
        <TextField
          label="Pentru ce ai plătit?"
          value={description}
          onChangeText={setDescription}
          onBlur={touch("description")}
          placeholder="ex. Piața Obor"
          maxLength={DESCRIPTION_MAX_LENGTH}
          error={errorFor("description")}
        />
        <TextField
          label="Sumă plătită"
          value={amount}
          onChangeText={setAmount}
          onBlur={touch("amount")}
          placeholder="0,00"
          keyboardType="decimal-pad"
          accessory={<Text style={styles.currency}>lei</Text>}
          error={errorFor("amount")}
        />
        <TextField
          label="Data plății"
          value={date}
          onChangeText={setDate}
          onBlur={touch("date")}
          placeholder="ZZ.LL.AAAA"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          error={errorFor("date")}
        />
        <SelectField
          label="Categorie"
          value={category}
          options={EXPENSE_CATEGORIES}
          labels={EXPENSE_CATEGORY_LABELS}
          onChange={setCategory}
        />
        <SegmentedField
          label="Cum ai plătit?"
          value={paymentMethod}
          options={PAYMENT_METHODS}
          labels={PAYMENT_METHOD_LABELS}
          onChange={setPaymentMethod}
        />
        <TextField
          label="Notă (opțional)"
          value={note}
          onChangeText={setNote}
          maxLength={NOTE_MAX_LENGTH}
          multiline
        />
        <PrimaryButton title="Adaugă cheltuiala" onPress={handleSubmit} disabled={!canSubmit} loading={loading} />
      </Card>
      <TextLink href="/">Renunță</TextLink>
    </Screen>
  );
}

const styles = StyleSheet.create({
  currency: {
    ...typography.bodyLg,
    paddingRight: spacing.lg,
    color: colors.textSecondary,
  },
});
