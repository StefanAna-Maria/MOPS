import { useRef, useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { formatDisplayDate } from "@ocrinvoice/shared";
import { Screen } from "@/components/screen";
import { Card } from "@/components/card";
import { ExpenseFormFields } from "@/components/expense-form-fields";
import { PrimaryButton } from "@/components/primary-button";
import { TextLink } from "@/components/text-link";
import { apiFetch } from "@/lib/api";
import { showServerUnavailable } from "@/lib/alerts";
import { localTodayIso } from "@/lib/dates";
import { useProfile } from "@/lib/profile-context";
import { createRequestId } from "@/lib/request-id";
import { EMPTY_EXPENSE_VALUES, useExpenseForm } from "@/lib/use-expense-form";

export default function AddExpenseScreen() {
  const { activeContext, company } = useProfile();
  // The expense goes to the profile selected on Acasă (personal or company), and is shown only there.
  const profileName = activeContext === "company" && company ? company.name : "Personal";
  const form = useExpenseForm({ ...EMPTY_EXPENSE_VALUES, date: formatDisplayDate(localTodayIso()) });
  const [loading, setLoading] = useState(false);

  // One id per expense: a retry after a timeout reuses it, so the server saves the expense only once (CA-03.6).
  const requestId = useRef(createRequestId());
  const submitting = useRef(false);

  async function handleSubmit() {
    if (!form.canSubmit || submitting.current) {
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
          description: form.description.trim(),
          amount: form.normalizedAmount,
          date: form.isoDate,
          category: form.category,
          paymentMethod: form.paymentMethod,
          note: form.note.trim(),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.code === "INVALID_EXPENSE" && Array.isArray(data.fields)) {
          form.touchAll();
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
        <ExpenseFormFields form={form} descriptionLabel="Pentru ce ai plătit?" placeholder="ex. Piața Obor" />
        <PrimaryButton title="Adaugă cheltuiala" onPress={handleSubmit} disabled={!form.canSubmit} loading={loading} />
      </Card>
      <TextLink href="/">Renunță</TextLink>
    </Screen>
  );
}
