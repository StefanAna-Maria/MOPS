import {
  LOW_CONFIDENCE,
  checkTotal,
  formatDisplayDate,
  parseAmount,
  parseDisplayDate,
  parseLineAmount,
  suggestCategory,
  validateScannedDocument,
  type DocumentKind,
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

/** Invoice lines only: what the invoice says, shown under the line total (with VAT). Read-only. */
export type InvoiceLineDetail = {
  quantity: number;
  /** Price of one unit WITHOUT VAT, e.g. "50.00". */
  unitPrice: string;
  /** VAT of the whole line, e.g. "31.50". */
  vatAmount: string;
  /** The unit price or the VAT was read with a confidence under LOW_CONFIDENCE (0.8): shown with "Verifică". */
  toCheck: boolean;
};

export type ReviewItem = {
  key: string;
  name: ReviewField;
  /** The line total WITH VAT. */
  amount: ReviewField;
  /** A built-in code or the id of one of the user's own categories (US-03). */
  category: ReviewField<string>;
  invoice?: InvoiceLineDetail;
};

export type Review = {
  /** Receipt or invoice, as read (US-09). */
  documentKind: DocumentKind;
  merchant: ReviewField;
  date: ReviewField;
  time: ReviewField;
  total: ReviewField;
  paymentMethod: ReviewField<PaymentMethod | null>;
  category: string;
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
  const documentKind: DocumentKind = reading.documentKind ?? "RECEIPT";
  const items: ReviewItem[] = reading.items.map((item) => ({
    key: itemKey(),
    name: readField(item.name, asIs, ""),
    amount: readField(item.amount, withComma, ""),
    category: readField(item.category, asIs, "OTHER"),
    ...(documentKind === "INVOICE" && item.unitPrice?.value && item.vatAmount?.value
      ? {
          invoice: {
            quantity: item.quantity.value ?? 1,
            unitPrice: item.unitPrice.value,
            vatAmount: item.vatAmount.value,
            toCheck: item.unitPrice.confidence < LOW_CONFIDENCE || item.vatAmount.confidence < LOW_CONFIDENCE,
          },
        }
      : {}),
  }));
  return {
    documentKind,
    merchant: readField(reading.merchant, asIs, ""),
    date: readField(reading.date, formatDisplayDate, ""),
    // An invoice has no time: nothing to read, so nothing to check (it was flagged, and picking one filled in "now").
    time: documentKind === "INVOICE" ? { value: "", status: "ok" } : readField(reading.time, asIs, ""),
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
    documentKind: review.documentKind,
    merchant: review.merchant.value.trim(),
    date: parseDisplayDate(review.date.value) ?? review.date.value,
    time: review.documentKind === "INVOICE" ? null : review.time.value.trim() || null,
    total: parseAmount(review.total.value) ?? review.total.value,
    paymentMethod: review.paymentMethod.value,
    // The document's category follows its products (the picker was removed from the review screen, 2026-11-24).
    category: suggestCategory(
      review.items.map((item) => ({ amount: parseLineAmount(item.amount.value), category: item.category.value })),
    ),
    items: review.items.map((item) => ({
      name: item.name.value.trim(),
      amount: parseLineAmount(item.amount.value) ?? item.amount.value,
      category: item.category.value,
      // US-09: invoice lines keep what the invoice says (quantity, unit price WITHOUT VAT, VAT).
      ...(item.invoice
        ? { quantity: item.invoice.quantity, unitPrice: item.invoice.unitPrice, vatAmount: item.invoice.vatAmount }
        : {}),
    })),
  };
}

export function isFutureDate(review: Review, today: string): boolean {
  const date = parseDisplayDate(review.date.value);
  return date !== null && date > today;
}

export function isFutureTime(review: Review, today: string, currentTime: string): boolean {
  const time = review.time.value.trim();
  return parseDisplayDate(review.date.value) === today && /^\d{2}:\d{2}$/.test(time) && time > currentTime;
}

const FIELD_LABELS: Record<string, string> = {
  merchant: "Magazin",
  date: "Data",
  time: "Ora",
  total: "Total",
  paymentMethod: "Plată",
  category: "Categorie",
  items: "Produse",
};

export type SaveBlocker =
  | { kind: "toCheck"; count: number }
  | { kind: "noProducts" }
  | { kind: "amount" }
  | { kind: "total" }
  | { kind: "futureDate" }
  | { kind: "futureTime" }
  | { kind: "fields"; fields: string[] };

/** Why "Salvează documentul" is blocked, in the order the user should fix it; empty when it can be saved. */
export function saveBlockers(review: Review, today: string, currentTime: string): SaveBlocker[] {
  const blockers: SaveBlocker[] = [];
  const toCheck = countToCheck(review);
  if (toCheck > 0) {
    blockers.push({ kind: "toCheck", count: toCheck });
  }
  if (review.items.length === 0) {
    blockers.push({ kind: "noProducts" });
  } else if (review.items.some((item) => parseLineAmount(item.amount.value) === null)) {
    blockers.push({ kind: "amount" });
  } else if (!reviewTotal(review).matches) {
    blockers.push({ kind: "total" });
  }
  if (isFutureDate(review, today)) {
    blockers.push({ kind: "futureDate" });
  }
  if (isFutureTime(review, today, currentTime)) {
    blockers.push({ kind: "futureTime" });
  }
  const validation = validateScannedDocument(toDocumentBody(review), today, currentTime);
  if (!validation.ok && blockers.length === 0) {
    const fields = validation.fields.filter((field) => field in FIELD_LABELS).map((field) => FIELD_LABELS[field]);
    blockers.push({ kind: "fields", fields });
  }
  return blockers;
}

export function canSave(review: Review, today: string, currentTime?: string): boolean {
  return (
    countToCheck(review) === 0 &&
    reviewTotal(review).matches &&
    validateScannedDocument(toDocumentBody(review), today, currentTime).ok
  );
}
