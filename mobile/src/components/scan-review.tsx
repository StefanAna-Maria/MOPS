import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  DOCUMENT_KIND_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  parseLineAmount,
  type CategoryOption,
  type OcrReading,
} from "@ocrinvoice/shared";
import { Card } from "@/components/card";
import { CategoryField } from "@/components/category-field";
import { DateTimeField, formatPickedDate } from "@/components/date-time-field";
import { PrimaryButton } from "@/components/primary-button";
import { SegmentedField } from "@/components/segmented-field";
import { TextField } from "@/components/text-field";
import { apiFetch } from "@/lib/api";
import { BUILT_IN_CATEGORIES, fetchCategories } from "@/lib/categories";
import { showServerUnavailable } from "@/lib/alerts";
import { localTimeNow, localTodayIso } from "@/lib/dates";
import { amountToCents, formatLei } from "@/lib/expense-list";
import { REVIEW_MESSAGES } from "@/lib/expense-messages";
import {
  canSave,
  confirmField,
  createReview,
  editField,
  isFutureDate,
  isFutureTime,
  newItem,
  reviewTotal,
  saveBlockers,
  toDocumentBody,
  type Review,
  type SaveBlocker,
  type ReviewField,
  type ReviewItem,
} from "@/lib/scan-review";
import { colors, radius, spacing, typography } from "@/constants/theme";

type ScanReviewProps = {
  scanId: string;
  reading: OcrReading;
};

function FieldStatusBadge<T>({
  label,
  field,
  onConfirm,
}: {
  label: string;
  field: ReviewField<T>;
  onConfirm: () => void;
}) {
  if (field.status === "verify") {
    const empty = field.value === null || field.value === "";
    return (
      <View style={styles.badgeRow}>
        <Text style={[styles.badge, styles.badgeVerify]} accessibilityLabel={`${label}: ${REVIEW_MESSAGES.verify}`}>
          {REVIEW_MESSAGES.verify}
        </Text>
        {empty ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${REVIEW_MESSAGES.confirm}: ${label}`}
            onPress={onConfirm}
            hitSlop={8}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.confirm}>{REVIEW_MESSAGES.confirm}</Text>
          </Pressable>
        )}
      </View>
    );
  }
  if (field.status === "corrected") {
    return (
      <View style={styles.badgeRow}>
        <Text
          style={[styles.badge, styles.badgeCorrected]}
          accessibilityLabel={`${label}: ${REVIEW_MESSAGES.corrected}`}
        >
          {REVIEW_MESSAGES.corrected}
        </Text>
      </View>
    );
  }
  return null;
}

type TextKey = "merchant" | "date" | "time" | "total";

function blockerMessage(blocker: SaveBlocker) {
  switch (blocker.kind) {
    case "toCheck":
      return REVIEW_MESSAGES.blockedToCheck(blocker.count);
    case "noProducts":
      return REVIEW_MESSAGES.blockedNoProducts;
    case "amount":
      return REVIEW_MESSAGES.blockedAmount;
    case "total":
      return REVIEW_MESSAGES.blockedTotal;
    case "futureDate":
      return REVIEW_MESSAGES.futureDate;
    case "futureTime":
      return REVIEW_MESSAGES.futureTime;
    case "fields":
      return REVIEW_MESSAGES.blockedFields(blocker.fields.join(", "));
  }
}

export function ScanReview({ scanId, reading }: ScanReviewProps) {
  const [review, setReview] = useState<Review>(() => createReview(reading));
  const [loading, setLoading] = useState(false);
  const saving = useRef(false);
  // US-03: the user's categories (their own included), as for a manual expense; built-in ones until they load.
  const [categories, setCategories] = useState<CategoryOption[]>(BUILT_IN_CATEGORIES);

  useEffect(() => {
    let ignore = false;
    fetchCategories()
      .then((list) => {
        if (ignore) {
          return;
        }
        setCategories(list);
        // A category removed since the reading (deleted or hidden) becomes "Altele", to be checked.
        const known = new Set(list.map((category) => category.id));
        setReview((previous) => ({
          ...previous,
          items: previous.items.map((item) =>
            known.has(item.category.value) ? item : { ...item, category: { value: "OTHER", status: "verify" } },
          ),
        }));
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  const today = localTodayIso();
  const now = localTimeNow();
  const total = reviewTotal(review);
  const allowed = canSave(review, today, now);
  const blockers = allowed ? [] : saveBlockers(review, today, now);
  const dateError = isFutureDate(review, today) ? REVIEW_MESSAGES.futureDate : null;
  const timeError = isFutureTime(review, today, now) ? REVIEW_MESSAGES.futureTime : null;
  const pickedToday = review.date.value === formatPickedDate(new Date());

  const editText = (key: TextKey) => (value: string) =>
    setReview((previous) => ({
      ...previous,
      [key]: editField(previous[key], value),
    }));
  const confirm = (key: TextKey | "paymentMethod") => () =>
    setReview((previous) => ({
      ...previous,
      [key]: confirmField(previous[key] as ReviewField<unknown>),
    }));

  const updateItem = (key: string, change: (item: ReviewItem) => ReviewItem) =>
    setReview((previous) => ({
      ...previous,
      items: previous.items.map((item) => (item.key === key ? change(item) : item)),
    }));

  function textField(key: TextKey, label: string, extra: Partial<Parameters<typeof TextField>[0]> = {}) {
    return (
      <View style={styles.field}>
        <TextField label={label} value={review[key].value} onChangeText={editText(key)} {...extra} />
        <FieldStatusBadge label={label} field={review[key]} onConfirm={confirm(key)} />
      </View>
    );
  }

  async function handleSave() {
    if (!allowed || saving.current) {
      return;
    }
    saving.current = true;
    setLoading(true);
    try {
      const response = await apiFetch(`/api/scans/${encodeURIComponent(scanId)}/document`, {
        method: "POST",
        body: JSON.stringify(toDocumentBody(review)),
      });
      if (!response.ok) {
        Alert.alert(REVIEW_MESSAGES.saveFailedTitle, REVIEW_MESSAGES.saveFailed);
        return;
      }
      router.replace("/");
    } catch {
      showServerUnavailable();
    } finally {
      saving.current = false;
      setLoading(false);
    }
  }

  return (
    <>
      <Text style={styles.documentKind} accessibilityRole="header">
        {REVIEW_MESSAGES.documentKind(DOCUMENT_KIND_LABELS[review.documentKind])}
      </Text>
      <Card>
        {textField("merchant", review.documentKind === "INVOICE" ? "Furnizor" : "Magazin")}
        <View style={styles.field}>
          <DateTimeField
            label="Data"
            mode="date"
            value={review.date.value}
            onChange={editText("date")}
            maximumDate={new Date()}
            placeholder="ZZ.LL.AAAA"
            error={dateError}
          />
          <FieldStatusBadge label="Data" field={review.date} onConfirm={confirm("date")} />
        </View>
        {review.documentKind === "INVOICE" ? null : (
        <View style={styles.field}>
          <DateTimeField
            label="Ora"
            mode="time"
            value={review.time.value}
            onChange={editText("time")}
            maximumDate={pickedToday ? new Date() : undefined}
            placeholder="HH:MM"
            error={timeError}
          />
          <FieldStatusBadge label="Ora" field={review.time} onConfirm={confirm("time")} />
        </View>
        )}
        {textField("total", "Total", {
          placeholder: "0,00",
          keyboardType: "decimal-pad",
          accessory: <Text style={styles.currency}>lei</Text>,
        })}
        <View style={styles.field}>
          <SegmentedField
            label="Plată"
            value={review.paymentMethod.value}
            options={PAYMENT_METHODS}
            labels={PAYMENT_METHOD_LABELS}
            onChange={(value) =>
              setReview((previous) => ({
                ...previous,
                paymentMethod: editField(previous.paymentMethod, value),
              }))
            }
          />
          <FieldStatusBadge label="Plată" field={review.paymentMethod} onConfirm={confirm("paymentMethod")} />
        </View>
      </Card>

      <Text style={styles.sectionTitle}>{REVIEW_MESSAGES.products}</Text>
      {review.items.map((item, index) => {
        const number = index + 1;
        const nameLabel = `Produsul ${number}`;
        const amountLabel = `Suma produsului ${number}`;
        const categoryLabel = `Categoria produsului ${number}`;
        return (
          <Card key={item.key}>
            <View style={styles.field}>
              <TextField
                label={nameLabel}
                value={item.name.value}
                onChangeText={(value) =>
                  updateItem(item.key, (it) => ({
                    ...it,
                    name: editField(it.name, value),
                  }))
                }
              />
              <FieldStatusBadge
                label={nameLabel}
                field={item.name}
                onConfirm={() =>
                  updateItem(item.key, (it) => ({
                    ...it,
                    name: confirmField(it.name),
                  }))
                }
              />
            </View>
            <View style={styles.field}>
              <TextField
                label={amountLabel}
                value={item.amount.value}
                onChangeText={(value) =>
                  updateItem(item.key, (it) => ({
                    ...it,
                    amount: editField(it.amount, value),
                  }))
                }
                placeholder="0,00"
                keyboardType="numbers-and-punctuation"
                accessory={<Text style={styles.currency}>lei</Text>}
                error={
                  item.amount.value.trim() && parseLineAmount(item.amount.value) === null
                    ? REVIEW_MESSAGES.invalidAmount
                    : null
                }
              />
              <FieldStatusBadge
                label={amountLabel}
                field={item.amount}
                onConfirm={() =>
                  updateItem(item.key, (it) => ({
                    ...it,
                    amount: confirmField(it.amount),
                  }))
                }
              />
              {item.invoice ? (
                // Unit price / VAT read under the agreed threshold (0.8) are flagged like the other values.
                <Text style={[styles.invoiceLine, item.invoice.toCheck && styles.invoiceLineCheck]}>
                  {REVIEW_MESSAGES.invoiceLine(
                    String(item.invoice.quantity).replace(".", ","),
                    formatLei(amountToCents(item.invoice.unitPrice)),
                    formatLei(amountToCents(item.invoice.vatAmount)),
                  )}
                  {item.invoice.toCheck ? ` · ${REVIEW_MESSAGES.verify}` : ""}
                </Text>
              ) : null}
            </View>
            <View style={styles.field}>
              <CategoryField
                label={categoryLabel}
                value={item.category.value}
                categories={categories}
                onCategoriesChange={setCategories}
                onChange={(value) =>
                  updateItem(item.key, (it) => ({
                    ...it,
                    category: editField(it.category, value),
                  }))
                }
              />
              <FieldStatusBadge
                label={categoryLabel}
                field={item.category}
                onConfirm={() =>
                  updateItem(item.key, (it) => ({
                    ...it,
                    category: confirmField(it.category),
                  }))
                }
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Șterge produsul ${number}`}
              onPress={() =>
                setReview((previous) => ({
                  ...previous,
                  items: previous.items.filter((other) => other.key !== item.key),
                }))
              }
              hitSlop={8}
              style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
            >
              <Text style={styles.deleteText}>{REVIEW_MESSAGES.deleteProduct}</Text>
            </Pressable>
          </Card>
        );
      })}
      <PrimaryButton
        title={REVIEW_MESSAGES.addProduct}
        variant="outline"
        onPress={() =>
          setReview((previous) => ({
            ...previous,
            items: [...previous.items, newItem()],
          }))
        }
      />

      <View style={styles.summary}>
        <Text style={styles.summaryTotal}>
          {REVIEW_MESSAGES.itemsTotal(formatLei(amountToCents(total.itemsTotal)))}
        </Text>
        <Text style={[styles.check, total.matches ? styles.checkOk : styles.checkWarn]}>
          {total.matches
            ? REVIEW_MESSAGES.totalMatches
            : REVIEW_MESSAGES.totalDiffers(formatLei(amountToCents(total.difference)))}
        </Text>
      </View>

      <PrimaryButton title={REVIEW_MESSAGES.save} onPress={handleSave} disabled={!allowed} loading={loading} />
      {blockers.length > 0 ? (
        <View style={styles.blockers} accessibilityLiveRegion="polite">
          {blockers.map((blocker) => (
            <Text key={blocker.kind} style={styles.blocker}>
              {blockerMessage(blocker)}
            </Text>
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  badge: {
    ...typography.bodySm,
    fontFamily: typography.label.fontFamily,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  badgeVerify: {
    color: "#92400E",
    backgroundColor: "#FEF3C7",
  },
  badgeCorrected: {
    color: colors.successText,
    backgroundColor: "#D1FAE5",
  },
  confirm: {
    ...typography.label,
    color: colors.primary,
  },
  currency: {
    ...typography.bodyLg,
    paddingRight: spacing.lg,
    color: colors.textSecondary,
  },
  documentKind: {
    ...typography.label,
    fontSize: 12,
    letterSpacing: 0.6,
    color: colors.textSecondary,
  },
  invoiceLine: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  invoiceLineCheck: {
    color: "#92400E",
  },
  sectionTitle: {
    ...typography.label,
    fontSize: 12,
    letterSpacing: 0.6,
    marginBottom: -spacing.sm,
    color: colors.textSecondary,
  },
  delete: {
    alignSelf: "flex-start",
  },
  deleteText: {
    ...typography.label,
    color: colors.error,
  },
  pressed: {
    opacity: 0.6,
  },
  summary: {
    alignItems: "center",
    gap: spacing.xs,
  },
  summaryTotal: {
    ...typography.label,
    color: colors.textPrimary,
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
  blockers: {
    alignItems: "center",
    gap: spacing.xs,
  },
  blocker: {
    ...typography.bodySm,
    textAlign: "center",
    color: "#92400E",
  },
});
