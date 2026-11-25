import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { DEFAULT_PAYMENT_METHOD, formatDisplayDate, isPaymentMethod, type ExpenseDocument } from "@ocrinvoice/shared";
import { Card } from "@/components/card";
import { ExpenseFormFields } from "@/components/expense-form-fields";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { apiFetch } from "@/lib/api";
import { showServerUnavailable } from "@/lib/alerts";
import { DOCUMENT_MESSAGES, EDIT_MESSAGES, HOME_MESSAGES } from "@/lib/expense-messages";
import { useExpenseForm } from "@/lib/use-expense-form";
import { colors, spacing, typography } from "@/constants/theme";
import { useT } from "@/i18n";

type DocumentState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "notFound" }
  | { status: "ok"; document: ExpenseDocument };

async function fetchDocument(id: string): Promise<DocumentState> {
  try {
    const response = await apiFetch(`/api/documents/${encodeURIComponent(id)}`);
    if (response.status === 404) {
      return { status: "notFound" };
    }
    if (!response.ok) {
      return { status: "error" };
    }
    const data: { document: ExpenseDocument } = await response.json();
    return { status: "ok", document: data.document };
  } catch {
    return { status: "error" };
  }
}

function CancelLink() {
  return (
    <Pressable accessibilityRole="link" onPress={() => router.back()} style={styles.cancel}>
      <Text style={styles.cancelText}>{EDIT_MESSAGES.cancel}</Text>
    </Pressable>
  );
}

/** CA-13.1: the saved values, to be corrected with the same fields and checks as when an expense is added. */
function EditForm({ document }: { document: ExpenseDocument }) {
  const t = useT();
  const isManual = document.type === "MANUAL";
  const form = useExpenseForm({
    description: document.merchant,
    amount: document.total.replace(".", ","),
    date: formatDisplayDate(document.date),
    category: document.category,
    paymentMethod: isPaymentMethod(document.paymentMethod) ? document.paymentMethod : DEFAULT_PAYMENT_METHOD,
    note: document.note ?? "",
  });
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  async function handleSave() {
    if (!form.canSubmit || submitting.current) {
      return;
    }
    submitting.current = true;
    setLoading(true);
    try {
      const response = await apiFetch(`/api/documents/${encodeURIComponent(document.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          merchant: form.description.trim(),
          amount: form.normalizedAmount,
          date: form.isoDate,
          category: form.category,
          paymentMethod: form.paymentMethod,
          note: form.note.trim(),
        }),
      });
      if (response.status === 404) {
        Alert.alert(DOCUMENT_MESSAGES.notFound);
        router.back();
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.code === "INVALID_EXPENSE" && Array.isArray(data.fields)) {
          form.touchAll();
        }
        Alert.alert(EDIT_MESSAGES.saveFailedTitle, EDIT_MESSAGES.saveFailed);
        return;
      }
      // The document and the list reload when they come back into focus (CA-13.2).
      router.back();
    } catch {
      showServerUnavailable();
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  const typeLabel = t.documentTypes[document.type] ?? document.type;
  return (
    <Screen title={EDIT_MESSAGES.title} subtitle={isManual ? typeLabel : `${typeLabel}. ${EDIT_MESSAGES.productsKept}`}>
      <Card>
        <ExpenseFormFields
          form={form}
          descriptionLabel={isManual ? t.expense.descriptionLabel : EDIT_MESSAGES.merchantLabel}
        />
        <PrimaryButton title={EDIT_MESSAGES.save} onPress={handleSave} disabled={!form.canSubmit} loading={loading} />
      </Card>
      <CancelLink />
    </Screen>
  );
}

export default function EditDocumentScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const documentId = id ? String(id) : "";
  const [state, setState] = useState<DocumentState>({ status: "loading" });

  useEffect(() => {
    let ignore = false;
    async function load() {
      const next: DocumentState = documentId ? await fetchDocument(documentId) : { status: "notFound" };
      if (!ignore) {
        setState(next);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [documentId]);

  async function retry() {
    setState({ status: "loading" });
    setState(await fetchDocument(documentId));
  }

  if (state.status === "ok") {
    return <EditForm document={state.document} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.state}>
        {state.status === "loading" ? <ActivityIndicator color={colors.primary} accessibilityLabel={t.common.loading} /> : null}
        {state.status === "notFound" ? <Text style={styles.stateText}>{DOCUMENT_MESSAGES.notFound}</Text> : null}
        {state.status === "error" ? (
          <>
            <Text style={styles.stateText}>{HOME_MESSAGES.loadError}</Text>
            <PrimaryButton title={HOME_MESSAGES.retry} variant="outline" onPress={retry} />
          </>
        ) : null}
        {state.status !== "loading" ? <CancelLink /> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  state: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  stateText: {
    ...typography.bodyMd,
    textAlign: "center",
    color: colors.textSecondary,
  },
  cancel: {
    alignSelf: "center",
  },
  cancelText: {
    ...typography.label,
    color: colors.primary,
  },
});
