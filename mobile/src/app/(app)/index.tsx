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
import { DEFAULT_DOCUMENT_FILTER, type DocumentFilter } from "@ocrinvoice/shared";
import { getGreeting } from "@/lib/greeting";
import { useProfile } from "@/lib/profile-context";
import { localTodayIso } from "@/lib/dates";
import { formatLei, groupByDay } from "@/lib/expense-list";
import { HOME_MESSAGES } from "@/lib/expense-messages";
import { useMonthDocuments, type MonthDocumentsState } from "@/lib/use-month-documents";
import { colors, radius, spacing, typography } from "@/constants/theme";
import { useT } from "@/i18n";

function ListState({ state, onRetry }: { state: MonthDocumentsState; onRetry: () => void }) {
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
  return <Text style={[styles.state, styles.stateText]}>{HOME_MESSAGES.empty}</Text>;
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
            <PrimaryButton title={t.home.addExpense} onPress={() => router.push("/add-expense")} />
            <View style={styles.filters}>
              <DocumentFilters value={filter} onChange={setFilter} />
              <Text style={styles.count} accessibilityLiveRegion="polite">
                {state.status === "ok" ? t.home.recordCount(state.documents.length) : " "}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={<ListState state={state} onRetry={retry} />}
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
