import {
  LOW_CONFIDENCE,
  checkTotal,
  formatDisplayDate,
  parseAmount,
  parseDisplayDate,
  parseLineAmount,
  suggestCategory,
  validateScannedDocument,
  type ExpenseCategory,
  type OcrField,
  type OcrReading,
  type PaymentMethod,
  type TotalCheck,
} from "@ocrinvoice/shared";

export type FieldStatus = "ok" | "verify" | "corrected" | "confirmed";

export type ReviewField<T = string> = {
  value: T;
  status: FieldStatus;
};

export type ReviewItem = {
  key: string;
  name: ReviewField;
  amount: ReviewField;
  category: ReviewField<ExpenseCategory>;
};

export type Review = {
  merchant: ReviewField;
  date: ReviewField;
  time: ReviewField;
  total: ReviewField;
  paymentMethod: ReviewField<PaymentMethod | null>;
  category: ExpenseCategory;
  items: ReviewItem[];
};

let lastItemKey = 0;

function itemKey() {
  lastItemKey += 1;
  return `item-${lastItemKey}`;
}

function statusOf(field: OcrField<unknown>): FieldStatus {
  return field.value === null || field.confidence < LOW_CONFIDENCE ? "verify" : "ok";
}

function readField<T, U>(field: OcrField<T>, format: (value: T) => U, empty: U): ReviewField<U> {
  return { value: field.value === null ? empty : format(field.value), status: statusOf(field) };
}

const withComma = (amount: string) => amount.replace(".", ",");
const asIs = <T>(value: T) => value;

export function createReview(reading: OcrReading): Review {
  const items: ReviewItem[] = reading.items.map((item) => ({
    key: itemKey(),
    name: readField(item.name, asIs, ""),
    amount: readField(item.amount, withComma, ""),
    category: readField(item.category, asIs, "OTHER"),
  }));
  return {
    merchant: readField(reading.merchant, asIs, ""),
    date: readField(reading.date, formatDisplayDate, ""),
    time: readField(reading.time, asIs, ""),
    total: readField(reading.total, withComma, ""),
    paymentMethod: readField<PaymentMethod, PaymentMethod | null>(reading.paymentMethod, asIs, null),
    category: suggestCategory(
      reading.items.map((item) => ({ amount: item.amount.value, category: item.category.value })),
    ),
    items,
  };
}

export function editField<T>(_field: ReviewField<T>, value: T): ReviewField<T> {
  return { value, status: "corrected" };
}

export function confirmField<T>(field: ReviewField<T>): ReviewField<T> {
  return { ...field, status: "confirmed" };
}

export function newItem(): ReviewItem {
  return {
    key: itemKey(),
    name: { value: "", status: "verify" },
    amount: { value: "", status: "verify" },
    category: { value: "OTHER", status: "ok" },
  };
}

export function countToCheck(review: Review): number {
  const fields: ReviewField<unknown>[] = [
    review.merchant,
    review.date,
    review.time,
    review.total,
    review.paymentMethod,
    ...review.items.flatMap((item) => [item.name, item.amount, item.category]),
  ];
  return fields.filter((field) => field.status === "verify").length;
}

export function reviewTotal(review: Review): TotalCheck {
  return checkTotal(
    parseAmount(review.total.value),
    review.items.map((item) => parseLineAmount(item.amount.value)),
  );
}

export function toDocumentBody(review: Review) {
  return {
    merchant: review.merchant.value.trim(),
    date: parseDisplayDate(review.date.value) ?? review.date.value,
    time: review.time.value.trim() || null,
    total: parseAmount(review.total.value) ?? review.total.value,
    paymentMethod: review.paymentMethod.value,
    category: review.category,
    items: review.items.map((item) => ({
      name: item.name.value.trim(),
      amount: parseLineAmount(item.amount.value) ?? item.amount.value,
      category: item.category.value,
    })),
  };
}

export function canSave(review: Review, today: string): boolean {
  return (
    countToCheck(review) === 0 &&
    reviewTotal(review).matches &&
    validateScannedDocument(toDocumentBody(review), today).ok
  );
}
