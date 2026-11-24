import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import {
  DEFAULT_EXPENSE_CATEGORY,
  DEFAULT_PAYMENT_METHOD,
  DESCRIPTION_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  formatDisplayDate,
  isDescriptionValid,
  isPaymentDateValid,
  parseAmount,
  parseDisplayDate,
  type CategoryOption,
  type PaymentMethod,
} from "@ocrinvoice/shared";
import { Screen } from "@/components/screen";
import { Card } from "@/components/card";
import { TextField } from "@/components/text-field";
import { CategoryField } from "@/components/category-field";
import { DateTimeField } from "@/components/date-time-field";
import { SegmentedField } from "@/components/segmented-field";
import { PrimaryButton } from "@/components/primary-button";
import { TextLink } from "@/components/text-link";
import { apiFetch } from "@/lib/api";
import { showServerUnavailable } from "@/lib/alerts";
import { localTodayIso } from "@/lib/dates";
import { BUILT_IN_CATEGORIES, fetchCategories } from "@/lib/categories";
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
  // A built-in code or the id of one of the user's own categories (US-03).
  const [category, setCategory] = useState<string>(DEFAULT_EXPENSE_CATEGORY);
  const [categories, setCategories] = useState<CategoryOption[]>(BUILT_IN_CATEGORIES);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(DEFAULT_PAYMENT_METHOD);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState<Record<Field, boolean>>({ description: false, amount: false, date: false });
  const [loading, setLoading] = useState(false);

  // One id per expense: a retry after a timeout reuses it, so the server saves the expense only once (CA-03.6).
  const requestId = useRef(createRequestId());
  const submitting = useRef(false);

  // US-03: the user's categories (their own included); the built-in ones are shown until they load.
  useEffect(() => {
    let ignore = false;
    fetchCategories()
      .then((list) => {
        if (!ignore) {
          setCategories(list);
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

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
        {/* US-03: a calendar to pick the date (no future dates); today by default. */}
        <DateTimeField
          label="Data plății"
          mode="date"
          value={date}
          onChange={(value) => {
            setDate(value);
            touch("date")();
          }}
          maximumDate={new Date()}
          placeholder="ZZ.LL.AAAA"
          error={errorFor("date")}
        />
        <CategoryField
          value={category}
          categories={categories}
          onChange={setCategory}
          onCategoriesChange={setCategories}
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
