import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  EXPENSE_CATEGORY_LABELS,
  LOW_CONFIDENCE,
  PAYMENT_METHOD_LABELS,
  formatDisplayDate,
  type OcrField,
  type OcrReading,
  type Scan,
  type ScanErrorCode,
} from "@ocrinvoice/shared";
import { PrimaryButton } from "@/components/primary-button";
import { amountToCents, formatLei } from "@/lib/expense-list";
import { SCAN_MESSAGES } from "@/lib/expense-messages";
import { POLL_INTERVAL_MS, fetchScan } from "@/lib/scan-upload";
import { colors, elevation, radius, spacing, typography } from "@/constants/theme";

type ScreenState =
  | { status: "processing"; elapsedSeconds: number }
  | { status: "done"; reading: OcrReading }
  | { status: "failed"; errorCode: ScanErrorCode | "NOT_FOUND" | "NETWORK" };

function percent(confidence: number) {
  return `${Math.round(confidence * 100)}%`;
}

function ReadValue<T>({ label, field, format }: { label: string; field: OcrField<T>; format: (value: T) => string }) {
  const low = field.confidence < LOW_CONFIDENCE;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        <Text style={styles.rowValue}>{field.value === null ? "—" : format(field.value)}</Text>
        <Text
          style={[styles.confidence, low && styles.confidenceLow]}
          accessibilityLabel={`Siguranță ${percent(field.confidence)}`}
        >
          {percent(field.confidence)}
        </Text>
      </View>
    </View>
  );
}

function ReadingView({ reading }: { reading: OcrReading }) {
  const lei = (amount: string) => formatLei(amountToCents(amount));
  return (
    <>
      <View style={styles.card}>
        <ReadValue label="Magazin" field={reading.merchant} format={(v) => v} />
        <ReadValue label="Data" field={reading.date} format={formatDisplayDate} />
        <ReadValue label="Ora" field={reading.time} format={(v) => v} />
        <ReadValue label="Total" field={reading.total} format={lei} />
        <ReadValue label="Plată" field={reading.paymentMethod} format={(v) => PAYMENT_METHOD_LABELS[v]} />
      </View>

      <Text style={styles.sectionTitle}>PRODUSE</Text>
      <View style={styles.card}>
        {reading.items.length === 0 ? <Text style={styles.empty}>Niciun produs găsit.</Text> : null}
        {reading.items.map((item, index) => (
          <View key={index} style={[styles.item, index > 0 && styles.itemDivider]}>
            <View style={styles.itemTexts}>
              <Text style={styles.itemName}>{item.name.value}</Text>
              <Text style={styles.itemMeta}>
                {item.quantity.value ?? 1} × {item.category.value ? EXPENSE_CATEGORY_LABELS[item.category.value] : "—"}
              </Text>
            </View>
            <View style={styles.itemRight}>
              <Text style={styles.itemAmount}>{item.amount.value === null ? "—" : lei(item.amount.value)}</Text>
              <Text style={[styles.confidence, item.amount.confidence < LOW_CONFIDENCE && styles.confidenceLow]}>
                {percent(item.amount.confidence)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={[styles.check, reading.totalMatches ? styles.checkOk : styles.checkWarn]}>
        {reading.totalMatches
          ? SCAN_MESSAGES.totalMatches
          : `${SCAN_MESSAGES.totalDiffers} (${lei(reading.itemsTotal)}).`}
      </Text>
    </>
  );
}

/**
 * US-09: waits for the server to read the uploaded photo and shows what was read, with the confidence of each value.
 * US-10 (progress stages and errors) and US-11 (checking and saving) build on this screen.
 */
export default function ScanResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scanId = id ? String(id) : "";
  const [state, setState] = useState<ScreenState>({ status: "processing", elapsedSeconds: 0 });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();

    async function poll() {
      let scan: Scan | null;
      try {
        scan = scanId ? await fetchScan(scanId) : null;
      } catch {
        if (!cancelled) {
          setState({ status: "failed", errorCode: "NETWORK" });
        }
        return;
      }
      if (cancelled) {
        return;
      }
      if (!scan) {
        setState({ status: "failed", errorCode: "NOT_FOUND" });
      } else if (scan.status === "DONE" && scan.reading) {
        setState({ status: "done", reading: scan.reading });
      } else if (scan.status === "FAILED") {
        setState({ status: "failed", errorCode: scan.errorCode ?? "OCR_UNAVAILABLE" });
      } else {
        setState({ status: "processing", elapsedSeconds: Math.round((Date.now() - started) / 1000) });
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scanId]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          {state.status === "done" ? SCAN_MESSAGES.doneTitle : SCAN_MESSAGES.title}
        </Text>

        {state.status === "processing" ? (
          <View style={styles.processing}>
            <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Se citește" />
            <Text style={styles.processingText}>{SCAN_MESSAGES.reading}</Text>
            <Text style={styles.processingHint}>
              {SCAN_MESSAGES.readingHint} {state.elapsedSeconds > 0 ? `(${state.elapsedSeconds} s)` : ""}
            </Text>
          </View>
        ) : null}

        {state.status === "failed" ? (
          <View style={styles.processing}>
            <Text style={styles.failedText}>{SCAN_MESSAGES.failed}</Text>
            <Text style={styles.processingHint}>{SCAN_MESSAGES.failedReasons[state.errorCode]}</Text>
            <PrimaryButton title={SCAN_MESSAGES.retake} onPress={() => router.replace("/scan")} />
          </View>
        ) : null}

        {state.status === "done" ? <ReadingView reading={state.reading} /> : null}

        <PrimaryButton title={SCAN_MESSAGES.home} variant="outline" onPress={() => router.replace("/")} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  title: {
    ...typography.headlineXl,
    color: colors.textPrimary,
  },
  processing: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  processingText: {
    ...typography.headlineSm,
    color: colors.textPrimary,
  },
  processingHint: {
    ...typography.bodyMd,
    textAlign: "center",
    color: colors.textSecondary,
  },
  failedText: {
    ...typography.headlineSm,
    textAlign: "center",
    color: colors.error,
  },
  card: {
    ...elevation.level1,
    borderRadius: radius.base,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    flexShrink: 1,
  },
  rowValue: {
    ...typography.label,
    flexShrink: 1,
    textAlign: "right",
    color: colors.textPrimary,
  },
  confidence: {
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontSize: 11,
    color: colors.successText,
  },
  confidenceLow: {
    color: "#92400E",
  },
  sectionTitle: {
    ...typography.label,
    fontSize: 12,
    letterSpacing: 0.6,
    marginBottom: -spacing.sm,
    color: colors.textSecondary,
  },
  empty: {
    ...typography.bodyMd,
    paddingVertical: spacing.md,
    color: colors.textSecondary,
  },
  item: {
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  itemDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemTexts: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  itemMeta: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  itemRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  itemAmount: {
    ...typography.label,
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  check: {
    ...typography.bodyMd,
    textAlign: "center",
  },
  checkOk: {
    color: colors.successText,
  },
  checkWarn: {
    color: "#92400E",
  },
});
