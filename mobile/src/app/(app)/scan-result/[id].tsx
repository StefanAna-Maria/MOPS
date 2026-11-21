import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  EXPENSE_CATEGORY_LABELS,
  LOW_CONFIDENCE,
  PAYMENT_METHOD_LABELS,
  SCAN_STAGES,
  SCAN_STAGE_LABELS,
  formatDisplayDate,
  type OcrField,
  type OcrReading,
  type Scan,
  type ScanErrorCode,
  type ScanStage,
} from "@ocrinvoice/shared";
import { PrimaryButton } from "@/components/primary-button";
import { amountToCents, formatLei } from "@/lib/expense-list";
import { SCAN_MESSAGES } from "@/lib/expense-messages";
import { POLL_INTERVAL_MS, ScanUploadError, fetchScan, retryScan } from "@/lib/scan-upload";
import { colors, elevation, radius, spacing, typography } from "@/constants/theme";

type ScreenState =
  | { status: "processing"; stage: ScanStage; elapsedSeconds: number }
  | { status: "done"; reading: OcrReading }
  | { status: "failed"; errorCode: ScanErrorCode | "NOT_FOUND" | "NETWORK" };

export function resolveActiveStage(
  serverStage: ScanStage | null | undefined,
  elapsedSeconds: number,
): ScanStage {
  if (
    serverStage === "UPLOADING" ||
    serverStage === "EXTRACTING_FIELDS" ||
    serverStage === "EXTRACTING_ITEMS"
  ) {
    return serverStage;
  }
  if (elapsedSeconds >= 8) {
    return "EXTRACTING_ITEMS";
  }
  if (elapsedSeconds >= 4) {
    return "EXTRACTING_FIELDS";
  }
  return "READING";
}

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

function ReadingStages({ activeStage, elapsedSeconds }: { activeStage: ScanStage; elapsedSeconds: number }) {
  const activeIndex = SCAN_STAGES.indexOf(activeStage);

  return (
    <View style={styles.processing}>
      <View style={[styles.card, styles.stagesCard]}>
        <View style={styles.stagesHeader}>
          <View style={styles.stagesIconCircle}>
            <Ionicons name="scan-outline" size={24} color={colors.primary} />
          </View>
          <View style={styles.stagesHeaderTexts}>
            <Text style={styles.stagesHeaderTitle}>Analiză inteligentă OCR</Text>
            <Text style={styles.stagesHeaderSubtitle}>
              {SCAN_MESSAGES.readingHint}
            </Text>
          </View>
          {elapsedSeconds > 0 ? (
            <View style={styles.elapsedBadge}>
              <Text style={styles.elapsedBadgeText}>{elapsedSeconds}s</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.stagesDivider} />

        {SCAN_STAGES.map((stage, index) => {
          const isDone = index < activeIndex;
          const isActive = index === activeIndex;
          const statusKey = isDone ? "done" : isActive ? "active" : "pending";

          return (
            <View
              key={stage}
              style={[
                styles.stageRow,
                index > 0 && styles.itemDivider,
                isActive && styles.stageRowActive,
              ]}
              testID={`stage-${statusKey}-${stage}`}
            >
              <View
                style={[
                  styles.stageIndicator,
                  isDone && styles.stageIndicatorDone,
                  isActive && styles.stageIndicatorActive,
                ]}
              >
                {isDone ? (
                  <Ionicons name="checkmark" size={14} color={colors.white} />
                ) : isActive ? (
                  <ActivityIndicator size="small" color={colors.primary} accessibilityLabel="Se citește" />
                ) : (
                  <View style={styles.stageDotPending} />
                )}
              </View>
              <Text
                style={[
                  styles.stageText,
                  isDone && styles.stageTextDone,
                  isActive && styles.stageTextActive,
                ]}
              >
                {SCAN_STAGE_LABELS[stage]}
              </Text>
            </View>
          );
        })}
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
 * US-09 / US-10: waits for the server to read the uploaded photo, shows the real reading stages (CA-10.1),
 * handles OCR / unreadable errors with retry (CA-10.2), and shows what was read with the confidence of each value.
 */
export default function ScanResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scanId = id ? String(id) : "";
  const [state, setState] = useState<ScreenState>({
    status: "processing",
    stage: "READING",
    elapsedSeconds: 0,
  });
  const [attempt, setAttempt] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

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
        const elapsedSeconds = Math.round((Date.now() - started) / 1000);
        setState({
          status: "processing",
          stage: resolveActiveStage(scan.stage, elapsedSeconds),
          elapsedSeconds,
        });
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scanId, attempt]);

  async function handleRetry() {
    if (isRetrying) {
      return;
    }
    if (!scanId || (state.status === "failed" && state.errorCode === "NOT_FOUND")) {
      router.replace("/scan");
      return;
    }
    setIsRetrying(true);
    try {
      await retryScan(scanId);
      setState({ status: "processing", stage: "READING", elapsedSeconds: 0 });
      setAttempt((prev) => prev + 1);
    } catch (error) {
      const code = error instanceof ScanUploadError && error.code === "NOT_FOUND" ? "NOT_FOUND" : "NETWORK";
      setState({ status: "failed", errorCode: code });
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          {state.status === "done" ? SCAN_MESSAGES.doneTitle : SCAN_MESSAGES.title}
        </Text>

        {state.status === "processing" ? (
          <ReadingStages activeStage={state.stage} elapsedSeconds={state.elapsedSeconds} />
        ) : null}

        {state.status === "failed" ? (
          <View style={styles.failedCard}>
            <View style={styles.failedIconBadge}>
              <Ionicons name="alert-circle-outline" size={32} color={colors.error} />
            </View>
            <View style={styles.failedTextGroup}>
              <Text style={styles.failedText}>{SCAN_MESSAGES.failed}</Text>
              <Text style={styles.processingHint}>{SCAN_MESSAGES.failedReasons[state.errorCode]}</Text>
            </View>
            <View style={styles.failedDivider} />
            <View style={styles.failedActions}>
              <PrimaryButton title={SCAN_MESSAGES.retry} onPress={handleRetry} loading={isRetrying} />
              <PrimaryButton
                title={SCAN_MESSAGES.retake}
                variant="secondary"
                onPress={() => router.replace("/scan")}
                disabled={isRetrying}
              />
              <PrimaryButton
                title={SCAN_MESSAGES.home}
                variant="outline"
                onPress={() => router.replace("/")}
                disabled={isRetrying}
              />
            </View>
          </View>
        ) : null}

        {state.status === "done" ? <ReadingView reading={state.reading} /> : null}

        {state.status !== "failed" ? (
          <PrimaryButton title={SCAN_MESSAGES.home} variant="outline" onPress={() => router.replace("/")} />
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
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  title: {
    ...typography.headlineXl,
    color: colors.textPrimary,
  },
  processing: {
    gap: spacing.md,
  },
  stagesCard: {
    width: "100%",
    paddingVertical: spacing.sm,
  },
  stagesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  stagesIconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.base,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
  },
  stagesHeaderTexts: {
    flex: 1,
    gap: 2,
  },
  stagesHeaderTitle: {
    ...typography.headlineSm,
    color: colors.textPrimary,
  },
  stagesHeaderSubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  elapsedBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: colors.border,
  },
  elapsedBadgeText: {
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontSize: 12,
    color: colors.textBody,
  },
  stagesDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: -spacing.lg,
  },
  stageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  stageRowActive: {
    backgroundColor: colors.primaryTint,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  stageIndicator: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  stageIndicatorDone: {
    backgroundColor: colors.success,
  },
  stageIndicatorActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#99F6E4",
  },
  stageDotPending: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.borderStrong,
  },
  stageText: {
    ...typography.bodyLg,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  stageTextDone: {
    color: colors.textBody,
  },
  stageTextActive: {
    ...typography.headlineSm,
    color: colors.primary,
  },
  processingHint: {
    ...typography.bodyMd,
    textAlign: "center",
    color: colors.textSecondary,
  },
  failedCard: {
    ...elevation.level1,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.lg,
  },
  failedIconBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    alignItems: "center",
    justifyContent: "center",
  },
  failedTextGroup: {
    alignItems: "center",
    gap: spacing.xs,
  },
  failedText: {
    ...typography.headlineMd,
    textAlign: "center",
    color: colors.textPrimary,
  },
  failedDivider: {
    width: "100%",
    height: 1,
    backgroundColor: colors.border,
  },
  failedActions: {
    width: "100%",
    gap: spacing.md,
  },
  homeLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
  },
  homeLinkPressed: {
    opacity: 0.7,
    backgroundColor: "#F1F5F9",
  },
  homeLinkText: {
    ...typography.label,
    color: colors.textSecondary,
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
    justifyContent: "space-between",
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
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
