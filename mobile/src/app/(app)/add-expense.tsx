import { useRef, useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { formatDisplayDate } from "@ocrinvoice/shared";
import { Screen } from "@/components/screen";
import { Card } from "@/components/card";
import { ExpenseFormFields } from "@/components/expense-form-fields";
import { PrimaryButton } from "@/components/primary-button";
import { BackLink } from "@/components/back-link";
import { apiFetch } from "@/lib/api";
import { showServerUnavailable } from "@/lib/alerts";
import { localTodayIso } from "@/lib/dates";
import { useProfile } from "@/lib/profile-context";
import { createRequestId } from "@/lib/request-id";
import { EMPTY_EXPENSE_VALUES, useExpenseForm } from "@/lib/use-expense-form";
import { useT } from "@/i18n";

export default function AddExpenseScreen() {
  const t = useT();
  const { activeContext, company } = useProfile();
  // The expense goes to the profile selected on Acasă (personal or company), and is shown only there.
  const profileName = activeContext === "company" && company ? company.name : t.profile.personal;
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
        Alert.alert(t.expense.saveFailedTitle, t.common.checkDataAndRetry);
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
    <Screen title={t.expense.title} subtitle={t.expense.subtitle(profileName)}>
      <Card>
        <ExpenseFormFields
          form={form}
          descriptionLabel={t.expense.descriptionLabel}
          placeholder={t.expense.descriptionPlaceholder}
        />
        <PrimaryButton title={t.expense.submit} onPress={handleSubmit} disabled={!form.canSubmit} loading={loading} />
      </Card>
      <BackLink>{t.common.cancel}</BackLink>
    </Screen>
  );
}
