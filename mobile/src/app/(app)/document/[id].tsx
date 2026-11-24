import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  PAYMENT_METHOD_LABELS,
  formatDisplayDate,
  isPaymentMethod,
  type ExpenseDocument,
} from "@ocrinvoice/shared";
import { DeleteDocumentSheet } from "@/components/delete-document-sheet";
import { DocumentPhoto } from "@/components/document-photo";
import { PrimaryButton } from "@/components/primary-button";
import { apiFetch } from "@/lib/api";
import { showServerUnavailable } from "@/lib/alerts";
import { amountToCents, documentSubtitle, formatLei } from "@/lib/expense-list";
import { DOCUMENT_MESSAGES, HOME_MESSAGES, REVIEW_MESSAGES } from "@/lib/expense-messages";
import { colors, elevation, radius, spacing, typography } from "@/constants/theme";

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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function DocumentDetail({ document }: { document: ExpenseDocument }) {
  // An invoice has a date but no time (a time saved with one would only be when it was checked, not the invoice's).
  const isInvoice = document.type === "SCANNED_INVOICE";
  const date = formatDisplayDate(document.date) + (document.time && !isInvoice ? `, ${document.time}` : "");
  // A manual expense has exactly one line, named like the expense: listing it again under PRODUSE adds nothing.
  const showProducts = document.type !== "MANUAL";
  const payment = isPaymentMethod(document.paymentMethod)
    ? PAYMENT_METHOD_LABELS[document.paymentMethod]
    : document.paymentMethod;

  return (
    <>
      <View style={styles.summary}>
        <Text style={styles.merchant} accessibilityRole="header">
          {document.merchant}
        </Text>
        <Text style={styles.subtitle}>{documentSubtitle(document)}</Text>
        <Text style={styles.total}>{formatLei(amountToCents(document.total))}</Text>
      </View>

      <View style={styles.card}>
        <DetailRow label="Data" value={date} />
        <DetailRow label="Plată" value={payment} />
        {/* Only a manual expense has a note (typed by the user); a scanned receipt or invoice has none. */}
        {document.type === "MANUAL" ? <DetailRow label="Notă" value={document.note ?? "—"} /> : null}
      </View>

      {showProducts ? (
        <>
      <Text style={styles.sectionTitle}>PRODUSE</Text>
      <View style={styles.card}>
        {document.lines.map((line, index) => (
          <View key={line.id} style={[styles.lineRow, index > 0 && styles.lineDivider]}>
            <View style={styles.lineTexts}>
              <Text style={styles.lineName}>{line.name}</Text>
              {line.unitPrice && line.vatAmount ? (
                // US-09, invoice lines: quantity × unit price WITHOUT VAT + the line VAT (the amount on the right includes it).
                <Text style={styles.lineInvoice}>
                  {REVIEW_MESSAGES.invoiceLine(
                    (line.quantity ?? "1").replace(".", ","),
                    formatLei(amountToCents(line.unitPrice)),
                    formatLei(amountToCents(line.vatAmount)),
                  )}
                </Text>
              ) : null}
            </View>
            <Text style={styles.lineAmount}>{formatLei(amountToCents(line.amount))}</Text>
          </View>
        ))}
      </View>
        </>
      ) : null}

      {document.fileId ? (
        <>
          <Text style={styles.sectionTitle}>POZA</Text>
          <DocumentPhoto fileId={document.fileId} />
        </>
      ) : null}
    </>
  );
}

export default function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<DocumentState>({ status: "loading" });

  const documentId = id ? String(id) : "";

  useEffect(() => {
    let ignore = false;
    async function loadDocument() {
      const next: DocumentState = documentId ? await fetchDocument(documentId) : { status: "notFound" };
      if (!ignore) {
        setState(next);
      }
    }
    loadDocument();
    return () => {
      ignore = true;
    };
  }, [documentId]);

  const retry = useCallback(async () => {
    setState({ status: "loading" });
    setState(await fetchDocument(documentId));
  }, [documentId]);

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (deleting) {
      return;
    }
    setDeleting(true);
    try {
      const response = await apiFetch(`/api/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
      if (response.status === 404) {
        setConfirming(false);
        Alert.alert(DOCUMENT_MESSAGES.notFound);
        router.back();
        return;
      }
      if (!response.ok) {
        setConfirming(false);
        Alert.alert(DOCUMENT_MESSAGES.deleteFailedTitle, DOCUMENT_MESSAGES.deleteFailed);
        return;
      }
      setConfirming(false);
      router.back();
    } catch {
      setConfirming(false);
      showServerUnavailable();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Înapoi"
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.back}>‹ Înapoi</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {state.status === "loading" ? (
          <ActivityIndicator style={styles.state} color={colors.primary} accessibilityLabel="Se încarcă" />
        ) : null}
        {state.status === "notFound" ? <Text style={styles.stateText}>{DOCUMENT_MESSAGES.notFound}</Text> : null}
        {state.status === "error" ? (
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>{HOME_MESSAGES.loadError}</Text>
            <PrimaryButton title={HOME_MESSAGES.retry} variant="outline" onPress={retry} />
          </View>
        ) : null}
        {state.status === "ok" ? (
          <>
            <DocumentDetail document={state.document} />
            <View style={styles.deleteArea}>
              <PrimaryButton
                title={DOCUMENT_MESSAGES.delete}
                variant="dangerOutline"
                onPress={() => setConfirming(true)}
              />
            </View>
            <DeleteDocumentSheet
              visible={confirming}
              document={state.document}
              deleting={deleting}
              onConfirm={handleDelete}
              onCancel={() => setConfirming(false)}
            />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  back: {
    ...typography.label,
    fontSize: 15,
    color: colors.primary,
  },
  pressed: {
    opacity: 0.6,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  deleteArea: {
    marginTop: spacing.xl,
    paddingTop: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  summary: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  merchant: {
    ...typography.headlineXl,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  total: {
    ...typography.label,
    fontSize: 28,
    lineHeight: 36,
    marginTop: spacing.sm,
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  card: {
    ...elevation.level1,
    borderRadius: radius.base,
    paddingHorizontal: spacing.lg,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  detailValue: {
    ...typography.label,
    flexShrink: 1,
    textAlign: "right",
    color: colors.textPrimary,
  },
  sectionTitle: {
    ...typography.label,
    fontSize: 12,
    letterSpacing: 0.6,
    marginBottom: -spacing.sm,
    color: colors.textSecondary,
  },
  lineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  lineDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  lineTexts: {
    flex: 1,
    gap: 2,
  },
  lineName: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  lineInvoice: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  lineAmount: {
    ...typography.label,
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  state: {
    marginTop: spacing.xxl,
  },
  stateBox: {
    marginTop: spacing.xxl,
    gap: spacing.lg,
  },
  stateText: {
    ...typography.bodyMd,
    marginTop: spacing.xxl,
    textAlign: "center",
    color: colors.textSecondary,
  },
});
