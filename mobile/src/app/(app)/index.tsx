import { useState } from "react";
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ContextSwitcher } from "@/components/context-switcher";
import { AccountMenu } from "@/components/account-menu";
import { PrimaryButton } from "@/components/primary-button";
import { ExpenseRow } from "@/components/expense-row";
import { DocumentFilters } from "@/components/document-filters";
import { MonthSummaryCard } from "@/components/month-summary-card";
import { DEFAULT_DOCUMENT_FILTER, formatRecordCount, type DocumentFilter } from "@ocrinvoice/shared";
import { getGreeting } from "@/lib/greeting";
import { useProfile } from "@/lib/profile-context";
import { localTodayIso } from "@/lib/dates";
import { formatLei, groupByDay } from "@/lib/expense-list";
import { HOME_MESSAGES } from "@/lib/expense-messages";
import { useMonthDocuments, type MonthDocumentsState } from "@/lib/use-month-documents";
import { colors, elevation, radius, spacing, typography } from "@/constants/theme";
import { useT } from "@/i18n";

const EMPTY_FILTER_VISUALS: Record<
  DocumentFilter,
  { icon: keyof typeof Ionicons.glyphMap; color: string; tint: string }
> = {
  ALL: { icon: "wallet-outline", color: colors.primary, tint: colors.primaryTint },
  RECEIPTS: { icon: "receipt-outline", color: "#0284C7", tint: "#E0F2FE" },
  INVOICES: { icon: "document-text-outline", color: "#7C3AED", tint: "#EDE9FE" },
  MANUAL: { icon: "create-outline", color: "#D97706", tint: "#FEF3C7" },
};

function ListState({
  state,
  filter,
  onRetry,
}: {
  state: MonthDocumentsState;
  filter: DocumentFilter;
  onRetry: () => void;
}) {
  const t = useT();
  if (state.status === "loading") {
    return <ActivityIndicator style={styles.state} color={colors.primary} accessibilityLabel={t.common.loading} />;
  }
  if (state.status === "error") {
    return (
      <View style={[styles.state, styles.stateBox]}>
        <Text style={styles.stateText}>{HOME_MESSAGES.loadError}</Text>
        <PrimaryButton title={HOME_MESSAGES.retry} variant="outline" onPress={onRetry} />
      </View>
    );
  }
  const visual = EMPTY_FILTER_VISUALS[filter];
  return (
    <View style={styles.emptyCard} testID="empty-documents-card">
      <View style={[styles.emptyIconCircle, { backgroundColor: visual.tint }]}>
        <Ionicons name={visual.icon} size={26} color={visual.color} />
      </View>
      <Text style={styles.emptyTitle}>{HOME_MESSAGES.emptyByFilter[filter]}</Text>
      <Text style={styles.emptySubtitle}>{HOME_MESSAGES.empty}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const t = useT();
  const { profile, activeContext } = useProfile();
  const [filter, setFilter] = useState<DocumentFilter>(DEFAULT_DOCUMENT_FILTER);
  const { state, retry } = useMonthDocuments(activeContext, filter);
  const sections = state.status === "ok" ? groupByDay(state.documents, localTodayIso()) : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.header}>
        <View style={styles.side}>
          <ContextSwitcher />
        </View>
        <Text style={styles.brand} accessibilityRole="header">
          OCRInvoice
        </Text>
        <View style={[styles.side, styles.sideRight]}>
          <AccountMenu />
        </View>
      </View>
      <SectionList
        style={styles.list}
        sections={sections}
        keyExtractor={(document) => document.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.top}>
            <Text style={styles.greeting}>
              {getGreeting()}, {profile?.firstName}
            </Text>
            {state.status !== "error" && (
              <MonthSummaryCard
                summary={state.status === "ok" ? state.summary : null}
                loading={state.status === "loading"}
                onOpenStatistics={() => router.push("/statistics")}
              />
            )}
            <PrimaryButton title={t.home.addExpense} onPress={() => router.push("/add-expense")} />
            <View style={styles.filters}>
              <DocumentFilters value={filter} onChange={setFilter} />
              <Text style={styles.count} accessibilityLiveRegion="polite">
                {state.status === "ok" ? t.home.recordCount(state.documents.length) : " "}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={<ListState state={state} filter={filter} onRetry={retry} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader} accessibilityRole="header">
            <Text style={styles.dayTitle}>{section.title}</Text>
            <Text style={styles.dayTotal}>{formatLei(section.totalCents)}</Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <ExpenseRow
            document={item}
            first={index === 0}
            last={index === section.data.length - 1}
            onPress={() => router.push({ pathname: "/document/[id]", params: { id: item.id } })}
          />
        )}
      />
      <View style={styles.fabContainer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.home.scan}
          onPress={() => router.push("/scan")}
          style={({ pressed }) => [styles.scanFab, pressed && styles.scanFabPressed]}
        >
          <Ionicons name="camera-outline" size={26} color={colors.white} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  side: {
    flex: 1,
    alignItems: "flex-start",
  },
  sideRight: {
    alignItems: "flex-end",
  },
  brand: {
    ...typography.headlineSm,
    color: colors.primary,
  },
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  top: {
    gap: spacing.xl,
    marginBottom: spacing.sm,
  },
  filters: {
    gap: spacing.sm,
  },
  count: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  greeting: {
    ...typography.headlineXl,
    color: colors.textPrimary,
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  dayTitle: {
    ...typography.label,
    fontSize: 12,
    letterSpacing: 0.6,
    color: colors.textSecondary,
  },
  dayTotal: {
    ...typography.label,
    fontSize: 12,
    color: colors.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  state: {
    marginTop: spacing.xxl,
  },
  stateBox: {
    gap: spacing.lg,
  },
  stateText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: "center",
  },
  emptyCard: {
    ...elevation.level1,
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    ...typography.headlineSm,
    color: colors.textPrimary,
    textAlign: "center",
  },
  emptySubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: "center",
  },
  fabContainer: {
    alignItems: "center",
    paddingBottom: spacing.lg,
  },
  scanFab: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 10px 15px -3px rgba(13, 148, 136, 0.35)",
  },
  scanFabPressed: {
    backgroundColor: colors.primaryActive,
  },
});
