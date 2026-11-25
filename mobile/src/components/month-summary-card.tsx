import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  amountToCents,
  computeCategoryShares,
  formatVariationPercent,
  type CategoryBreakdownItem,
  type MonthSummary,
} from "@ocrinvoice/shared";
import { categoryVisual } from "@/lib/category-visuals";
import { categoryLabel, formatLei } from "@/lib/expense-list";
import { SUMMARY_MESSAGES } from "@/lib/expense-messages";
import { monthName, useT } from "@/i18n";
import { colors, fonts, radius, spacing, typography } from "@/constants/theme";

const IS_TEST = process.env.NODE_ENV === "test";

function capitalize(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

type CategoryRowData = CategoryBreakdownItem & {
  cents: number;
  share: number;
  color: string;
};

function prepareCategoryRows(items: CategoryBreakdownItem[]): CategoryRowData[] {
  const positive = items
    .map((item) => ({ ...item, cents: amountToCents(item.total) }))
    .filter((item) => item.cents > 0);
  const shares = computeCategoryShares(positive.map((item) => item.cents));
  return positive.map((item, index) => ({
    ...item,
    // US-17: a built-in category in the app's language (the server names them in Romanian); the user's own as named.
    categoryName: categoryLabel(item.category, item.categoryName),
    share: typeof item.percent === "number" ? item.percent : shares[index],
    color: categoryVisual(item.category).color,
  }));
}

type MonthSummaryCardProps = {
  summary: MonthSummary | null;
  loading?: boolean;
  onOpenStatistics?: () => void;
};

/**
 * US-05: Vibrant teal monthly spending card on Acasă showing "Cheltuit în {lună}", exact total to the ban,
 * red/green variation vs. previous month (hidden when there is no previous month), animated comparison bars,
 * interactive category chart, and expandable current + previous month category breakdown. When there are no
 * expenses yet in the current month, hides the statistics and displays a clean empty-statistics message instead.
 */
export function MonthSummaryCard({ summary, loading = false, onOpenStatistics }: MonthSummaryCardProps) {
  // Re-render in the new language when it changes (CA-17.2): the texts come from SUMMARY_MESSAGES.
  useT();
  const [expanded, setExpanded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const currentCents = summary ? amountToCents(summary.total) : 0;
  const [displayedCents, setDisplayedCents] = useState(currentCents);

  const progress = useRef(new Animated.Value(IS_TEST ? 1 : 0)).current;
  const entrance = useRef(new Animated.Value(IS_TEST ? 1 : 0)).current;
  const badgeScale = useRef(new Animated.Value(IS_TEST ? 1 : 0.75)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;
  const breakdownProgress = useRef(new Animated.Value(IS_TEST ? 1 : 0)).current;

  const summaryKey = summary
    ? `${summary.month}:${summary.total}:${summary.previousTotal ?? "none"}:${summary.count}:${summary.byCategory.length}`
    : "loading";

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
    if (!summary) {
      return;
    }
    setSelectedCategory(null);

    if (IS_TEST) {
      setDisplayedCents(currentCents);
      progress.setValue(1);
      entrance.setValue(1);
      badgeScale.setValue(1);
      return;
    }

    progress.setValue(0);
    entrance.setValue(0);
    badgeScale.setValue(0.72);

    const counter = new Animated.Value(0);
    const listenerId = counter.addListener(({ value }) => {
      setDisplayedCents(Math.round(value));
    });

    const anim = Animated.parallel([
      Animated.timing(entrance, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(badgeScale, {
        toValue: 1,
        friction: 6,
        tension: 110,
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(counter, {
        toValue: currentCents,
        duration: 540,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]);

    anim.start(({ finished }) => {
      if (finished) {
        setDisplayedCents(currentCents);
      }
    });

    return () => {
      counter.removeListener(listenerId);
      anim.stop();
    };
  }, [summaryKey, summary, currentCents, entrance, progress, badgeScale]);

  useEffect(() => {
    if (!expanded) {
      return;
    }
    if (IS_TEST) {
      breakdownProgress.setValue(1);
      return;
    }
    breakdownProgress.setValue(0);
    const anim = Animated.timing(breakdownProgress, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [expanded, breakdownProgress]);

  if (loading || !summary) {
    return (
      <View
        style={styles.card}
        accessibilityLabel={SUMMARY_MESSAGES.loading}
        testID="month-summary-skeleton"
      >
        <View style={styles.glowTopRight} pointerEvents="none" />
        <View style={styles.glowBottomLeft} pointerEvents="none" />
        <View style={[styles.skeletonLine, { width: "52%", height: 18 }]} />
        <View style={[styles.skeletonLine, { width: "62%", height: 34, marginTop: spacing.md }]} />
        <View style={[styles.skeletonLine, { width: "100%", height: 10, marginTop: spacing.lg }]} />
      </View>
    );
  }

  const currentMonthLabel = monthName(summary.month);
  const previousMonthLabel = monthName(summary.previousMonth);
  const hasCurrentMonthExpenses = summary.count > 0;
  const previousCents = summary.previousTotal !== null ? amountToCents(summary.previousTotal) : null;
  const variation = summary.variationPercent;

  // CA-05.2: red when spent more, green when spent less, hidden when no previous month.
  const isHigher = variation !== null && variation > 0;
  const isLower = variation !== null && variation < 0;
  const variationBadgeStyle = isHigher
    ? styles.badgeHigher
    : isLower
      ? styles.badgeLower
      : styles.badgeSame;
  const variationTextColor = isHigher ? "#DC2626" : isLower ? "#047857" : colors.white;
  const variationIcon: keyof typeof Ionicons.glyphMap = isHigher
    ? "trending-up"
    : isLower
      ? "trending-down"
      : "remove-outline";

  const diffCents = previousCents !== null ? currentCents - previousCents : null;
  const diffMessage =
    diffCents === null
      ? null
      : diffCents > 0
        ? SUMMARY_MESSAGES.spentMoreDiff(formatLei(diffCents), previousMonthLabel)
        : diffCents < 0
          ? SUMMARY_MESSAGES.spentLessDiff(formatLei(Math.abs(diffCents)), previousMonthLabel)
          : SUMMARY_MESSAGES.spentSameDiff(previousMonthLabel);

  const maxBarCents = previousCents !== null ? Math.max(currentCents, previousCents, 1) : 1;
  const currentRatio = previousCents !== null ? Math.min(100, Math.round((currentCents / maxBarCents) * 100)) : 0;
  const previousRatio = previousCents !== null ? Math.min(100, Math.round((previousCents / maxBarCents) * 100)) : 0;

  const currentBarWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", `${currentCents > 0 ? Math.max(currentRatio, 5) : 0}%`],
  });
  const previousBarWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", `${previousCents && previousCents > 0 ? Math.max(previousRatio, 5) : 0}%`],
  });

  const positiveCategories = currentCents > 0 ? prepareCategoryRows(summary.byCategory) : [];
  const previousCategories = prepareCategoryRows(summary.previousByCategory ?? []);

  const spotlight = selectedCategory
    ? positiveCategories.find((item) => item.category === selectedCategory) ?? null
    : null;
  const topCategory = positiveCategories[0] ?? null;

  const amountTranslateY = entrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  const glowScale = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  const glowOpacity = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.26, 0.42] });

  function toggleCategory(categoryId: string) {
    setSelectedCategory((prev) => (prev === categoryId ? null : categoryId));
  }

  function renderBreakdownRows(rows: CategoryRowData[], keyPrefix: string) {
    return rows.map((item) => {
      const rowWidth = breakdownProgress.interpolate({
        inputRange: [0, 1],
        outputRange: ["0%", `${Math.max(item.share, 4)}%`],
      });
      return (
        <View key={`${keyPrefix}-${item.category}`} style={styles.breakdownItem}>
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownLeft}>
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <Text style={styles.breakdownName} numberOfLines={1}>
                {item.categoryName}
              </Text>
            </View>
            <View style={styles.breakdownRight}>
              <Text style={styles.breakdownShare}>{item.share}%</Text>
              <Text style={styles.breakdownAmount}>{formatLei(item.cents)}</Text>
            </View>
          </View>
          <View style={styles.breakdownTrack}>
            <Animated.View style={[styles.breakdownFill, { width: rowWidth, backgroundColor: item.color }]} />
          </View>
        </View>
      );
    });
  }

  return (
    <View style={styles.card} testID="month-summary-card">
      <Animated.View
        style={[styles.glowTopRight, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
        pointerEvents="none"
      />
      <View style={styles.glowBottomLeft} pointerEvents="none" />
      <View style={styles.glowTopLeft} pointerEvents="none" />

      <View style={styles.topRow}>
        <Text style={styles.monthLabel}>
          {SUMMARY_MESSAGES.spentInPrefix}
          <Text style={styles.monthNameHighlight}>{currentMonthLabel}</Text>
        </Text>

        {hasCurrentMonthExpenses && variation !== null && (
          <Animated.View
            testID="month-variation-badge"
            accessibilityLabel={`${formatVariationPercent(variation)} ${SUMMARY_MESSAGES.vsPreviousMonth(previousMonthLabel)}`}
            style={[styles.variationBadge, variationBadgeStyle, { transform: [{ scale: badgeScale }] }]}
          >
            <Ionicons name={variationIcon} size={14} color={variationTextColor} />
            <Text testID="month-variation-text" style={[styles.variationText, { color: variationTextColor }]}>
              {formatVariationPercent(variation)}
            </Text>
          </Animated.View>
        )}
      </View>

      <Animated.View style={{ opacity: entrance, transform: [{ translateY: amountTranslateY }] }}>
        <Text testID="month-summary-total" style={styles.totalAmount}>
          {formatLei(displayedCents)}
        </Text>
      </Animated.View>

      {!hasCurrentMonthExpenses ? (
        <View style={styles.emptyStatsBox} testID="month-no-stats-message">
          <Text style={styles.emptyStatsTitle}>{SUMMARY_MESSAGES.noStatsTitle(currentMonthLabel)}</Text>
          <Text style={styles.emptyStatsSubtitle}>{SUMMARY_MESSAGES.noStatsSubtitle}</Text>
        </View>
      ) : (
        <>
          {variation !== null && diffMessage !== null && (
            <View
              style={[
                styles.insightPill,
                isHigher ? styles.insightHigher : isLower ? styles.insightLower : styles.insightSame,
              ]}
              testID="month-diff-insight"
            >
              <View
                style={[
                  styles.dot,
                  { backgroundColor: isHigher ? "#FCA5A5" : isLower ? "#6EE7B7" : colors.white },
                ]}
              />
              <Text style={styles.insightText}>{diffMessage}</Text>
            </View>
          )}

          {variation !== null && previousCents !== null && (
            <View style={styles.comparisonPanel} testID="month-comparison-panel">
              <Text style={styles.comparisonCaption}>
                {SUMMARY_MESSAGES.vsPreviousMonth(previousMonthLabel)} · {formatLei(previousCents)}
              </Text>
              <View style={styles.barRows}>
                <View style={styles.barItem}>
                  <Text style={styles.barRowLabel}>{SUMMARY_MESSAGES.thisMonth}</Text>
                  <View style={styles.barTrack}>
                    <Animated.View
                      style={[
                        styles.barFill,
                        {
                          width: currentBarWidth,
                          backgroundColor: isHigher ? "#FCA5A5" : isLower ? "#6EE7B7" : colors.white,
                        },
                      ]}
                    />
                  </View>
                </View>
                <View style={styles.barItem}>
                  <Text style={styles.barRowLabel}>{capitalize(previousMonthLabel)}</Text>
                  <View style={styles.barTrack}>
                    <Animated.View
                      style={[
                        styles.barFill,
                        { width: previousBarWidth, backgroundColor: "rgba(255, 255, 255, 0.48)" },
                      ]}
                    />
                  </View>
                </View>
              </View>
            </View>
          )}

          {topCategory && (
            <View style={styles.statsRow} testID="month-quick-stats">
              <View style={styles.statTile}>
                <Text style={styles.statLabel}>{SUMMARY_MESSAGES.statExpenses}</Text>
                <Text style={styles.statValue}>{summary.count}</Text>
              </View>
              <View style={styles.statTile}>
                <Text style={styles.statLabel}>{SUMMARY_MESSAGES.statCategories}</Text>
                <Text style={styles.statValue}>{positiveCategories.length}</Text>
              </View>
              <View style={[styles.statTile, styles.statTileWide]}>
                <Text style={styles.statLabel}>{SUMMARY_MESSAGES.statTopCategory}</Text>
                <View style={styles.statTopRow}>
                  <View style={[styles.dot, { backgroundColor: topCategory.color }]} />
                  <Text style={styles.statValue} numberOfLines={1}>
                    {topCategory.categoryName}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {positiveCategories.length > 0 && (
            <View style={styles.categorySection}>
              <View style={styles.segmentedBar} testID="month-category-bar">
                {positiveCategories.map((item) => {
                  const isSelected = selectedCategory === item.category;
                  const dimmed = selectedCategory !== null && !isSelected;
                  return (
                    <Pressable
                      key={item.category}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.categoryName} ${item.share}%`}
                      onPress={() => toggleCategory(item.category)}
                      style={[
                        styles.segment,
                        {
                          flex: item.cents,
                          backgroundColor: item.color,
                          opacity: dimmed ? 0.35 : 1,
                          transform: [{ scaleY: isSelected ? 1.25 : 1 }],
                        },
                      ]}
                    />
                  );
                })}
              </View>

              {spotlight && (
                <View style={styles.spotlightCard} testID="month-category-spotlight">
                  <View style={styles.spotlightLeft}>
                    <View style={[styles.spotlightDot, { backgroundColor: spotlight.color }]} />
                    <Text style={styles.spotlightName} numberOfLines={1}>
                      {spotlight.categoryName}
                    </Text>
                  </View>
                  <View style={styles.spotlightRight}>
                    <Text style={styles.spotlightShare}>{spotlight.share}%</Text>
                    <Text style={styles.spotlightAmount}>{formatLei(spotlight.cents)}</Text>
                  </View>
                </View>
              )}

              <View style={styles.legendFooter}>
                <View style={styles.legendChips}>
                  {positiveCategories.slice(0, 3).map((item) => {
                    const isSelected = selectedCategory === item.category;
                    return (
                      <Pressable
                        key={item.category}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        onPress={() => toggleCategory(item.category)}
                        style={({ pressed }) => [
                          styles.legendChip,
                          isSelected && styles.legendChipSelected,
                          pressed && styles.expandButtonPressed,
                        ]}
                      >
                        <View style={[styles.dot, { backgroundColor: item.color }]} />
                        <Text style={styles.legendChipText} numberOfLines={1}>
                          {item.categoryName} {item.share}%
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.actionsRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={expanded ? SUMMARY_MESSAGES.hideCategories : SUMMARY_MESSAGES.showCategories}
                    accessibilityState={{ expanded }}
                    onPress={() => setExpanded((value) => !value)}
                    style={({ pressed }) => [styles.expandButton, pressed && styles.expandButtonPressed]}
                  >
                    <Text style={styles.expandText}>
                      {expanded ? SUMMARY_MESSAGES.hideCategories : SUMMARY_MESSAGES.showCategories}
                    </Text>
                    <Ionicons
                      name={expanded ? "chevron-up" : "chevron-down"}
                      size={14}
                      color="#CCFBF1"
                    />
                  </Pressable>

                  {onOpenStatistics && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={SUMMARY_MESSAGES.openFullStatistics}
                      onPress={onOpenStatistics}
                      style={({ pressed }) => [styles.statsLinkButton, pressed && styles.expandButtonPressed]}
                    >
                      <Text style={styles.statsLinkText}>{SUMMARY_MESSAGES.openFullStatistics}</Text>
                      <Ionicons name="arrow-forward" size={13} color={colors.white} />
                    </Pressable>
                  )}
                </View>
              </View>

              {expanded && (
                <View style={styles.breakdownBox} testID="month-category-breakdown">
                  <Text style={styles.breakdownTitle}>
                    {SUMMARY_MESSAGES.currentMonthCategories(currentMonthLabel)}
                  </Text>
                  {renderBreakdownRows(positiveCategories, "current")}

                  {previousCategories.length > 0 && (
                    <View style={styles.previousBreakdownSection} testID="month-previous-category-breakdown">
                      <Text style={styles.breakdownTitle}>
                        {SUMMARY_MESSAGES.previousMonthCategories(previousMonthLabel)}
                      </Text>
                      {renderBreakdownRows(previousCategories, "previous")}
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
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
    width: 184,
    height: 184,
    borderRadius: radius.full,
    backgroundColor: "rgba(45, 212, 191, 0.34)",
  },
  glowBottomLeft: {
    position: "absolute",
    bottom: -68,
    left: -38,
    width: 164,
    height: 164,
    borderRadius: radius.full,
    backgroundColor: "rgba(15, 118, 110, 0.6)",
  },
  glowTopLeft: {
    position: "absolute",
    top: -28,
    left: 42,
    width: 96,
    height: 96,
    borderRadius: radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  monthLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    lineHeight: 22,
    color: "#CCFBF1",
    flexShrink: 1,
  },
  monthNameHighlight: {
    fontFamily: fonts.headingBold,
    fontSize: 18,
    lineHeight: 22,
    color: colors.white,
  },
  variationBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  badgeHigher: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
  },
  badgeLower: {
    backgroundColor: "#D1FAE5",
    borderColor: "#6EE7B7",
  },
  badgeSame: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
  variationText: {
    fontFamily: fonts.headingBold,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ["tabular-nums"],
  },
  totalAmount: {
    fontFamily: fonts.headingBold,
    fontSize: 34,
    lineHeight: 40,
    color: colors.white,
    letterSpacing: -0.6,
    fontVariant: ["tabular-nums"],
  },
  emptyStatsBox: {
    backgroundColor: "rgba(15, 23, 42, 0.18)",
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  emptyStatsTitle: {
    ...typography.label,
    color: colors.white,
  },
  emptyStatsSubtitle: {
    ...typography.bodySm,
    color: "#CCFBF1",
  },
  insightPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  insightHigher: {
    backgroundColor: "rgba(220, 38, 38, 0.22)",
    borderColor: "rgba(252, 165, 165, 0.45)",
  },
  insightLower: {
    backgroundColor: "rgba(5, 150, 105, 0.28)",
    borderColor: "rgba(110, 231, 183, 0.45)",
  },
  insightSame: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  insightText: {
    ...typography.bodySm,
    color: colors.white,
    fontFamily: fonts.bodySemiBold,
    fontVariant: ["tabular-nums"],
  },
  comparisonPanel: {
    backgroundColor: "rgba(15, 23, 42, 0.18)",
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  comparisonCaption: {
    ...typography.bodySm,
    color: "#E2F8F5",
    fontFamily: fonts.bodySemiBold,
    fontVariant: ["tabular-nums"],
  },
  barRows: {
    gap: spacing.sm,
  },
  barItem: {
    gap: spacing.xs,
  },
  barRowLabel: {
    ...typography.bodySm,
    color: "#CCFBF1",
    fontFamily: fonts.bodySemiBold,
  },
  barTrack: {
    width: "100%",
    height: 8,
    borderRadius: radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: radius.full,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statTile: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.16)",
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  statTileWide: {
    flex: 1.5,
  },
  statLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 14,
    color: "#CCFBF1",
  },
  statTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statValue: {
    ...typography.label,
    color: colors.white,
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
  },
  categorySection: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  segmentedBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 12,
    borderRadius: radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    paddingHorizontal: 2,
    gap: 3,
  },
  segment: {
    height: 8,
    borderRadius: radius.full,
  },
  spotlightCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  spotlightLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  spotlightDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  spotlightName: {
    ...typography.label,
    color: colors.white,
    flexShrink: 1,
  },
  spotlightRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  spotlightShare: {
    ...typography.bodySm,
    color: "#E6FFFA",
    fontFamily: fonts.bodySemiBold,
    fontVariant: ["tabular-nums"],
  },
  spotlightAmount: {
    ...typography.label,
    color: colors.white,
    fontFamily: fonts.headingBold,
    fontVariant: ["tabular-nums"],
  },
  legendFooter: {
    gap: spacing.sm,
  },
  legendChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  legendChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(15, 23, 42, 0.16)",
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.full,
    maxWidth: "100%",
  },
  legendChipSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.24)",
    borderColor: "rgba(255, 255, 255, 0.65)",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  legendChipText: {
    ...typography.bodySm,
    color: colors.white,
    fontFamily: fonts.bodySemiBold,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  expandButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingVertical: 4,
  },
  statsLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.32)",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  statsLinkText: {
    ...typography.bodySm,
    color: colors.white,
    fontFamily: fonts.bodySemiBold,
  },
  expandButtonPressed: {
    opacity: 0.75,
  },
  expandText: {
    ...typography.bodySm,
    color: "#CCFBF1",
    fontFamily: fonts.bodySemiBold,
  },
  breakdownBox: {
    backgroundColor: "rgba(15, 23, 42, 0.24)",
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  previousBreakdownSection: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.16)",
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  breakdownTitle: {
    ...typography.bodySm,
    color: "#CCFBF1",
    fontFamily: fonts.bodySemiBold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  breakdownItem: {
    gap: 5,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  breakdownLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  breakdownName: {
    ...typography.bodyMd,
    color: colors.white,
    flexShrink: 1,
  },
  breakdownRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  breakdownShare: {
    ...typography.bodySm,
    color: "#CCFBF1",
    fontVariant: ["tabular-nums"],
  },
  breakdownAmount: {
    ...typography.label,
    color: colors.white,
    fontVariant: ["tabular-nums"],
  },
  breakdownTrack: {
    width: "100%",
    height: 6,
    borderRadius: radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    overflow: "hidden",
  },
  breakdownFill: {
    height: "100%",
    borderRadius: radius.full,
  },
  skeletonLine: {
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    borderRadius: radius.base,
  },
});
