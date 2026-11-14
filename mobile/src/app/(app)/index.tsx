import { ActivityIndicator, SectionList, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ContextSwitcher } from "@/components/context-switcher";
import { AccountMenu } from "@/components/account-menu";
import { PrimaryButton } from "@/components/primary-button";
import { ExpenseRow } from "@/components/expense-row";
import { getGreeting } from "@/lib/greeting";
import { useProfile } from "@/lib/profile-context";
import { localTodayIso } from "@/lib/dates";
import { formatLei, groupByDay } from "@/lib/expense-list";
import { HOME_MESSAGES } from "@/lib/expense-messages";
import { useMonthDocuments, type MonthDocumentsState } from "@/lib/use-month-documents";
import { colors, spacing, typography } from "@/constants/theme";

function ListState({ state, onRetry }: { state: MonthDocumentsState; onRetry: () => void }) {
  if (state.status === "loading") {
    return <ActivityIndicator style={styles.state} color={colors.primary} accessibilityLabel="Se încarcă" />;
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
  const { profile, activeContext } = useProfile();
  const { state, retry } = useMonthDocuments(activeContext);
  const sections = state.status === "ok" ? groupByDay(state.documents, localTodayIso()) : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
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
        sections={sections}
        keyExtractor={(document) => document.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.top}>
            <Text style={styles.greeting}>
              {getGreeting()}, {profile?.firstName}
            </Text>
            <PrimaryButton title="Adaugă o cheltuială" onPress={() => router.push("/add-expense")} />
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
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  top: {
    gap: spacing.xl,
    marginBottom: spacing.sm,
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
});
