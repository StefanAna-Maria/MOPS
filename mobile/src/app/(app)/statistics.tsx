import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  amountToCents,
  computeCategoryShares,
  type CategoryBreakdownItem,
  type ExpenseDocument,
} from "@ocrinvoice/shared";
import { PrimaryButton } from "@/components/primary-button";
import { categoryVisual } from "@/lib/category-visuals";
import { categoryLabel, formatLei } from "@/lib/expense-list";
import { formatDate, monthName, useT } from "@/i18n";
import { HOME_MESSAGES, STATISTICS_MESSAGES } from "@/lib/expense-messages";
import { useProfile } from "@/lib/profile-context";
import { useMonthDocuments } from "@/lib/use-month-documents";
import { colors, elevation, fonts, radius, spacing, typography } from "@/constants/theme";

const IS_TEST = process.env.NODE_ENV === "test";

type CategoryDocumentMatch = {
  document: ExpenseDocument;
  amountCents: number;
};

/** Finds every document in the month contributing to `categoryId`, using line-level amounts when cleanly split. */
function documentsForCategory(documents: ExpenseDocument[], categoryId: string): CategoryDocumentMatch[] {
  const matches: CategoryDocumentMatch[] = [];
  for (const doc of documents) {
    const docCents = amountToCents(doc.total);
    const lines = doc.lines ?? [];
    const byLineCat = new Map<string, number>();
    let linesSum = 0;
    for (const line of lines) {
      const c = amountToCents(line.amount);
      linesSum += c;
      byLineCat.set(line.category, (byLineCat.get(line.category) ?? 0) + c);
    }
    const canSplit =
      lines.length > 0 && linesSum === docCents && [...byLineCat.values()].every((cents) => cents > 0);

    if (canSplit) {
      const contributed = byLineCat.get(categoryId) ?? 0;
      if (contributed > 0) {
        matches.push({ document: doc, amountCents: contributed });
      }
    } else if (doc.category === categoryId && docCents > 0) {
      matches.push({ document: doc, amountCents: docCents });
    }
  }
  return matches.sort((a, b) => b.amountCents - a.amountCents);
}

/**
 * US-16: Dedicated monthly spending by category screen — displays every category with expenses in the current month,
 * ordered descending by amount, with exact lei totals (summing to the month total) and integer shares (summing to 100%).
 */
export default function StatisticsScreen() {
  const t = useT();
  const { activeContext, company } = useProfile();
  const { state, retry } = useMonthDocuments(activeContext, "ALL");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [period, setPeriod] = useState<"current" | "previous">("current");

  const barProgress = useRef(new Animated.Value(IS_TEST ? 1 : 0)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;

  const profileLabel = activeContext === "company" && company ? company.name : t.profile.personal;
  const summary = state.status === "ok" ? state.summary : null;
  const documents = state.status === "ok" ? state.documents : [];
  const hasPrevious = (summary?.previousByCategory?.length ?? 0) > 0;
  const activePeriod = period === "previous" && hasPrevious ? "previous" : "current";
  const dataKey = summary
    ? `${activeContext}:${activePeriod}:${summary.month}:${summary.total}:${summary.byCategory.length}`
    : "none";

  useEffect(() => {
    if (IS_TEST) {
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glowPulse]);

  useEffect(() => {
    setSelectedCategory(null);
    if (!summary) {
      return;
    }
    if (IS_TEST) {
      barProgress.setValue(1);
      return;
    }
    barProgress.setValue(0);
    const anim = Animated.timing(barProgress, {
      toValue: 1,
      duration: 560,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [dataKey, summary, barProgress]);

  const currentMonthLabel = summary ? monthName(summary.month) : "";
  const previousMonthLabel = summary ? monthName(summary.previousMonth) : "";
  const isPrevious = activePeriod === "previous";
  const monthLabel = isPrevious ? previousMonthLabel : currentMonthLabel;
  const totalCents = summary
    ? amountToCents(isPrevious ? (summary.previousTotal ?? "0.00") : summary.total)
    : 0;

  const sourceCategories = summary
    ? isPrevious
      ? (summary.previousByCategory ?? [])
      : summary.byCategory
    : [];

  const rawCategories =
    summary && totalCents > 0
      ? sourceCategories
          .map((item) => ({ ...item, cents: amountToCents(item.total) }))
          .filter((item) => item.cents > 0)
      : [];
  const fallbackShares = computeCategoryShares(rawCategories.map((item) => item.cents));
  const categories: Array<CategoryBreakdownItem & { cents: number; share: number }> = rawCategories.map(
    (item, index) => ({
      ...item,
      // US-17: a built-in category in the app's language (the server names them in Romanian).
      categoryName: categoryLabel(item.category, item.categoryName),
      share: typeof item.percent === "number" ? item.percent : fallbackShares[index],
    }),
  );

  const percentTotal = categories.reduce((sum, item) => sum + item.share, 0);
  const activeItem = selectedCategory ? categories.find((item) => item.category === selectedCategory) ?? null : null;
  const topCategory = categories[0] ?? null;

  const glowScale = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  const glowOpacity = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.42] });

  function toggleCategory(id: string) {
    setSelectedCategory((prev) => (prev === id ? null : id));
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={STATISTICS_MESSAGES.back}
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={styles.backText}>{STATISTICS_MESSAGES.back}</Text>
        </Pressable>

        <Text style={styles.headerTitle} accessibilityRole="header">
          {STATISTICS_MESSAGES.title}
        </Text>

        <View style={styles.profileBadge}>
          <Text style={styles.profileBadgeText} numberOfLines={1}>
            {profileLabel}
          </Text>
        </View>
      </View>

      {state.status === "loading" ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t.common.loading} />
        </View>
      ) : state.status === "error" ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{HOME_MESSAGES.loadError}</Text>
          <PrimaryButton title={HOME_MESSAGES.retry} variant="outline" onPress={retry} />
        </View>
      ) : categories.length === 0 ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.emptyCard} testID="statistics-empty-card">
            <View style={styles.emptyIconCircle}>
              <Ionicons name="pie-chart-outline" size={30} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>{STATISTICS_MESSAGES.emptyTitle(monthLabel)}</Text>
            <Text style={styles.emptySubtitle}>{STATISTICS_MESSAGES.emptySubtitle}</Text>
            <View style={styles.emptyAction}>
              <PrimaryButton
                title={STATISTICS_MESSAGES.addExpense}
                onPress={() => router.push("/add-expense")}
              />
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {hasPrevious && (
            <View style={styles.periodSwitcher} accessibilityRole="tablist" testID="statistics-period-switcher">
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: !isPrevious }}
                onPress={() => setPeriod("current")}
                style={[styles.periodTab, !isPrevious && styles.periodTabActive]}
              >
                <Text style={[styles.periodTabText, !isPrevious && styles.periodTabTextActive]}>
                  {currentMonthLabel.charAt(0).toUpperCase() + currentMonthLabel.slice(1)}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: isPrevious }}
                onPress={() => setPeriod("previous")}
                style={[styles.periodTab, isPrevious && styles.periodTabActive]}
              >
                <Text style={[styles.periodTabText, isPrevious && styles.periodTabTextActive]}>
                  {previousMonthLabel.charAt(0).toUpperCase() + previousMonthLabel.slice(1)}
                </Text>
              </Pressable>
            </View>
          )}

          <View style={styles.heroCard} testID="statistics-hero-card">
            <Animated.View
              style={[styles.glowTopRight, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
              pointerEvents="none"
            />
            <View style={styles.glowBottomLeft} pointerEvents="none" />

            <View style={styles.heroHeaderRow}>
              <Text style={styles.heroSubtitle}>
                {STATISTICS_MESSAGES.subtitlePrefix}
                <Text style={styles.heroMonthHighlight}>{monthLabel}</Text>
              </Text>
              {activeItem && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSelectedCategory(null)}
                  style={({ pressed }) => [styles.resetPill, pressed && styles.pressed]}
                >
                  <Text style={styles.resetPillText}>{STATISTICS_MESSAGES.resetSelection}</Text>
                </Pressable>
              )}
            </View>

            {activeItem ? (
              <View style={styles.heroMainRow} testID="statistics-hero-spotlight">
                <View style={styles.heroSpotlightNameRow}>
                  <View style={[styles.dotLarge, { backgroundColor: categoryVisual(activeItem.category).color }]} />
                  <Text style={styles.heroSpotlightName} numberOfLines={1}>
                    {activeItem.categoryName}
                  </Text>
                </View>
                <View style={styles.heroAmountRow}>
                  <Text style={styles.heroTotal}>{formatLei(activeItem.cents)}</Text>
                  <View style={styles.heroPercentPill}>
                    <Text style={styles.heroPercentText}>{activeItem.share}%</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.heroAmountRow}>
                <Text testID="statistics-month-total" style={styles.heroTotal}>
                  {formatLei(totalCents)}
                </Text>
                <View style={styles.heroPercentPill}>
                  <Text testID="statistics-percent-total" style={styles.heroPercentText}>
                    {percentTotal}%
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.stackedBar} testID="statistics-stacked-bar">
              {categories.map((item) => {
                const visual = categoryVisual(item.category);
                const isSelected = selectedCategory === item.category;
                const dimmed = selectedCategory !== null && !isSelected;
                return (
                  <Pressable
                    key={item.category}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.categoryName} ${item.share}%`}
                    onPress={() => toggleCategory(item.category)}
                    style={[
                      styles.stackedSegment,
                      {
                        flex: item.cents,
                        backgroundColor: visual.color,
                        opacity: dimmed ? 0.32 : 1,
                        transform: [{ scaleY: isSelected ? 1.25 : 1 }],
                      },
                    ]}
                  />
                );
              })}
            </View>

            {topCategory && (
              <View style={styles.topInsightPill} testID="statistics-top-insight">
                <View style={[styles.dotSmall, { backgroundColor: categoryVisual(topCategory.category).color }]} />
                <Text style={styles.topInsightText}>
                  {STATISTICS_MESSAGES.topShareInsight(topCategory.categoryName, topCategory.share)}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{STATISTICS_MESSAGES.allCategories}</Text>
            <Text style={styles.sectionMeta}>
              {percentTotal}% · {formatLei(totalCents)}
            </Text>
          </View>

          <View style={styles.list}>
            {categories.map((item, index) => {
              const visual = categoryVisual(item.category);
              const isSelected = selectedCategory === item.category;
              const widthAnim = barProgress.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", `${Math.max(item.share, 3)}%`],
              });
              const relatedDocs = isSelected && !isPrevious ? documentsForCategory(documents, item.category) : [];

              return (
                <Pressable
                  key={item.category}
                  testID={`category-row-${item.category}`}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isSelected, selected: isSelected }}
                  accessibilityLabel={`${item.categoryName}, ${formatLei(item.cents)}, ${item.share}%`}
                  onPress={() => toggleCategory(item.category)}
                  style={({ pressed }) => [
                    styles.categoryCard,
                    isSelected && { borderColor: visual.accent, borderWidth: 1.5 },
                    pressed && styles.cardPressed,
                  ]}
                >
                  <View style={[styles.leftAccent, { backgroundColor: visual.accent }]} />

                  <View style={styles.categoryBody}>
                    <View style={styles.categoryTop}>
                      <View style={[styles.iconCircle, { backgroundColor: visual.tint }]}>
                        <Ionicons name={visual.icon} size={20} color={visual.accent} />
                      </View>

                      <View style={styles.categoryInfo}>
                        <View style={styles.categoryNameRow}>
                          <Text style={styles.rankBadge}>#{index + 1}</Text>
                          <Text style={styles.categoryName} numberOfLines={1}>
                            {item.categoryName}
                          </Text>
                        </View>
                        <Text style={styles.categoryCount}>{STATISTICS_MESSAGES.categoryCount(item.count)}</Text>
                      </View>

                      <View style={styles.categoryFigures}>
                        <Text style={styles.categoryAmount}>{formatLei(item.cents)}</Text>
                        <View style={[styles.percentPill, { backgroundColor: visual.tint }]}>
                          <Text style={[styles.percentPillText, { color: visual.accent }]}>{item.share}%</Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.progressTrack}>
                      <Animated.View
                        style={[styles.progressFill, { width: widthAnim, backgroundColor: visual.accent }]}
                      />
                    </View>

                    {isSelected && relatedDocs.length > 0 && (
                      <View style={styles.drilldown} testID={`category-drilldown-${item.category}`}>
                        {relatedDocs.map(({ document, amountCents }) => (
                          <Pressable
                            key={document.id}
                            accessibilityRole="button"
                            onPress={() =>
                              router.push({ pathname: "/document/[id]", params: { id: document.id } })
                            }
                            style={({ pressed }) => [styles.drilldownRow, pressed && styles.pressed]}
                          >
                            <View style={styles.drilldownLeft}>
                              <Text style={styles.drilldownMerchant} numberOfLines={1}>
                                {document.merchant}
                              </Text>
                              <Text style={styles.drilldownDate}>{formatDate(document.date)}</Text>
                            </View>
                            <View style={styles.drilldownRight}>
                              <Text style={styles.drilldownAmount}>{formatLei(amountCents)}</Text>
                              <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.totalFooter} testID="statistics-total-footer">
            <Text style={styles.totalFooterLabel}>{STATISTICS_MESSAGES.totalMonth(monthLabel)}</Text>
            <View style={styles.totalFooterRight}>
              <Text style={styles.totalFooterPercent}>{percentTotal}%</Text>
              <Text style={styles.totalFooterAmount}>{formatLei(totalCents)}</Text>
            </View>
          </View>
        </ScrollView>
      )}
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
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flex: 1,
  },
  backText: {
    ...typography.label,
    color: colors.primary,
  },
  headerTitle: {
    ...typography.headlineSm,
    color: colors.textPrimary,
    textAlign: "center",
  },
  profileBadge: {
    flex: 1,
    alignItems: "flex-end",
  },
  profileBadgeText: {
    ...typography.bodySm,
    color: colors.primary,
    fontFamily: fonts.bodySemiBold,
    backgroundColor: colors.primaryTint,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    gap: spacing.lg,
  },
  errorText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: "center",
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  periodSwitcher: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    padding: 4,
    gap: 4,
  },
  periodTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    alignItems: "center",
  },
  periodTabActive: {
    backgroundColor: colors.primary,
  },
  periodTabText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  periodTabTextActive: {
    color: colors.white,
  },
  heroCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    padding: spacing.lg,
    gap: spacing.md,
    overflow: "hidden",
    boxShadow: "0 14px 28px -6px rgba(13, 148, 136, 0.42)",
  },
  glowTopRight: {
    position: "absolute",
    top: -54,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: radius.full,
    backgroundColor: "rgba(45, 212, 191, 0.34)",
  },
  glowBottomLeft: {
    position: "absolute",
    bottom: -66,
    left: -36,
    width: 160,
    height: 160,
    borderRadius: radius.full,
    backgroundColor: "rgba(15, 118, 110, 0.58)",
  },
  heroHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  heroSubtitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    lineHeight: 22,
    color: "#CCFBF1",
    flexShrink: 1,
  },
  heroMonthHighlight: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
    lineHeight: 22,
    color: colors.white,
  },
  resetPill: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  resetPillText: {
    ...typography.bodySm,
    color: colors.white,
    fontFamily: fonts.bodySemiBold,
  },
  heroMainRow: {
    gap: 4,
  },
  heroSpotlightNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dotLarge: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  dotSmall: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  heroSpotlightName: {
    ...typography.headlineSm,
    color: colors.white,
    flexShrink: 1,
  },
  heroAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  heroTotal: {
    fontFamily: fonts.headingBold,
    fontSize: 32,
    lineHeight: 38,
    color: colors.white,
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  heroPercentPill: {
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  heroPercentText: {
    fontFamily: fonts.headingBold,
    fontSize: 13,
    lineHeight: 16,
    color: colors.white,
    fontVariant: ["tabular-nums"],
  },
  stackedBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 16,
    borderRadius: radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    paddingHorizontal: 3,
    gap: 3,
  },
  stackedSegment: {
    height: 10,
    borderRadius: radius.full,
  },
  topInsightPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(15, 23, 42, 0.18)",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  topInsightText: {
    ...typography.bodySm,
    color: "#E6FFFA",
    fontFamily: fonts.bodySemiBold,
    flexShrink: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
  },
  sectionTitle: {
    ...typography.label,
    fontSize: 12,
    letterSpacing: 0.6,
    color: colors.textSecondary,
  },
  sectionMeta: {
    ...typography.label,
    fontSize: 12,
    color: colors.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  list: {
    gap: spacing.md,
  },
  categoryCard: {
    ...elevation.level1,
    borderRadius: radius.lg,
    flexDirection: "row",
    overflow: "hidden",
  },
  cardPressed: {
    opacity: 0.92,
  },
  leftAccent: {
    width: 5,
  },
  categoryBody: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  categoryTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryInfo: {
    flex: 1,
    gap: 2,
  },
  categoryNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rankBadge: {
    fontFamily: fonts.headingBold,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
  },
  categoryName: {
    ...typography.headlineSm,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  categoryCount: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  categoryFigures: {
    alignItems: "flex-end",
    gap: 4,
  },
  categoryAmount: {
    ...typography.headlineSm,
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  percentPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  percentPillText: {
    fontFamily: fonts.headingBold,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ["tabular-nums"],
  },
  progressTrack: {
    width: "100%",
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.full,
  },
  drilldown: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  drilldownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
    gap: spacing.sm,
  },
  drilldownLeft: {
    flex: 1,
    gap: 1,
  },
  drilldownMerchant: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontFamily: fonts.bodySemiBold,
  },
  drilldownDate: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  drilldownRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  drilldownAmount: {
    ...typography.label,
    color: colors.textBody,
    fontVariant: ["tabular-nums"],
  },
  totalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: "#99F6E4",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  totalFooterLabel: {
    ...typography.label,
    color: colors.primaryActive,
  },
  totalFooterRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  totalFooterPercent: {
    ...typography.label,
    color: colors.primary,
    fontVariant: ["tabular-nums"],
  },
  totalFooterAmount: {
    ...typography.headlineSm,
    color: colors.primaryActive,
    fontVariant: ["tabular-nums"],
  },
  emptyCard: {
    ...elevation.level1,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    backgroundColor: colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    ...typography.headlineMd,
    color: colors.textPrimary,
    textAlign: "center",
  },
  emptySubtitle: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: "center",
  },
  emptyAction: {
    width: "100%",
    marginTop: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
});

