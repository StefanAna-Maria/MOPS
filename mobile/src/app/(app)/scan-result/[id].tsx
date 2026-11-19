import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { OcrReading, Scan, ScanErrorCode } from "@ocrinvoice/shared";
import { PrimaryButton } from "@/components/primary-button";
import { ScanReview } from "@/components/scan-review";
import { SCAN_MESSAGES } from "@/lib/expense-messages";
import { POLL_INTERVAL_MS, fetchScan } from "@/lib/scan-upload";
import { colors, spacing, typography } from "@/constants/theme";

type ScreenState =
  | { status: "processing"; elapsedSeconds: number }
  | { status: "done"; reading: OcrReading }
  | { status: "failed"; errorCode: ScanErrorCode | "NOT_FOUND" | "NETWORK" };

/**
 * US-09: waits for the server to read the uploaded photo. Once it is read, US-11 lets the user check the values and
 * save the document. US-10 (progress stages and errors) builds on this screen.
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

        {state.status === "done" ? <ScanReview scanId={scanId} reading={state.reading} /> : null}

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
});
