import {
  DESCRIPTION_MAX_LENGTH,
  isExpenseCategory,
  isIsoDate,
  isPaymentMethod,
  type ExpenseCategory,
  type OcrField,
  type OcrItem,
  type OcrReading,
  type PaymentMethod,
} from "@ocrinvoice/shared";
import { OcrError } from "./ocr-client.js";

/**
 * Confidence the server gives a value when its own checks find a problem. The model's self-reported confidence is
 * not reliable: on a real receipt it reported 0.95 for every value, even after dropping a discount line.
 */
const SUSPICIOUS = 0.4;
const GUESSED = 0.5;
const MAX_AMOUNT_CENTS = 999_999_999;

type RawField = { value?: unknown; confidence?: unknown } | unknown;

function confidenceOf(field: RawField): number {
  const raw = typeof field === "object" && field !== null && "confidence" in field ? field.confidence : undefined;
  const value = typeof raw === "string" ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return GUESSED;
  }
  return Math.min(1, Math.max(0, value));
}

function valueOf(field: RawField): unknown {
  if (typeof field === "object" && field !== null && "value" in field) {
    return field.value;
  }
  return field;
}

function missing<T>(): OcrField<T> {
  return { value: null, confidence: 0 };
}

function cap<T>(field: OcrField<T>, limit: number): OcrField<T> {
  return { value: field.value, confidence: Math.min(field.confidence, limit) };
}

/** 12.5, "12,50", "12.5 lei", "-3.20" → cents, or null. */
function toCents(value: unknown): number | null {
  let text: string;
  if (typeof value === "number" && Number.isFinite(value)) {
    text = value.toFixed(2);
  } else if (typeof value === "string") {
    text = value.replace(/lei|ron/gi, "").replace(/\s/g, "").replace(",", ".");
  } else {
    return null;
  }
  const match = /^(-?)(\d+)(?:\.(\d{1,2})\d*)?$/.exec(text);
  if (!match) {
    return null;
  }
  const cents = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  if (cents > MAX_AMOUNT_CENTS) {
    return null;
  }
  return match[1] ? -cents : cents;
}

export function centsToAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function readText(field: RawField, maxLength: number): OcrField<string> {
  const value = valueOf(field);
  if (typeof value !== "string" || !value.trim()) {
    return missing();
  }
  return { value: value.trim().replace(/\s+/g, " ").slice(0, maxLength), confidence: confidenceOf(field) };
}

/** CA-04.5-style rule: a receipt date must be a real date and not in the future (in the user's time zone). */
function readDate(field: RawField, today: string): OcrField<string> {
  const value = valueOf(field);
  if (!isIsoDate(value)) {
    return missing();
  }
  const date: OcrField<string> = { value, confidence: confidenceOf(field) };
  // A date in the future is most likely day and month swapped (12/11 read as December 11).
  return value > today ? cap(date, SUSPICIOUS) : date;
}

function readTime(field: RawField): OcrField<string> {
  const value = valueOf(field);
  const match = typeof value === "string" ? /^(\d{1,2})[:.-](\d{2})/.exec(value.trim()) : null;
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    return missing();
  }
  return { value: `${match[1].padStart(2, "0")}:${match[2]}`, confidence: confidenceOf(field) };
}

function readPayment(field: RawField): OcrField<PaymentMethod> {
  const value = valueOf(field);
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : value;
  return isPaymentMethod(normalized) ? { value: normalized, confidence: confidenceOf(field) } : missing();
}

function readCategory(field: RawField): OcrField<ExpenseCategory> {
  const value = valueOf(field);
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : value;
  return isExpenseCategory(normalized)
    ? { value: normalized, confidence: confidenceOf(field) }
    : { value: "OTHER", confidence: SUSPICIOUS };
}

function readItem(raw: unknown): (OcrItem & { cents: number | null }) | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const item = raw as Record<string, RawField>;
  const name = readText(item.name, DESCRIPTION_MAX_LENGTH);
  if (!name.value) {
    return null;
  }
  const cents = toCents(valueOf(item.amount));
  const quantityValue = Number(valueOf(item.quantity));
  return {
    name,
    quantity:
      Number.isFinite(quantityValue) && quantityValue > 0
        ? { value: quantityValue, confidence: confidenceOf(item.quantity) }
        : { value: 1, confidence: GUESSED },
    amount: cents === null ? missing() : { value: centsToAmount(cents), confidence: confidenceOf(item.amount) },
    category: readCategory(item.category),
    cents,
  };
}

/** Extracts the JSON object from the model's answer, even when it is wrapped in ```json fences or extra text. */
export function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const text = fenced ? fenced[1] : raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new OcrError("UNREADABLE", "The OCR answer contains no JSON object");
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new OcrError("UNREADABLE", "The OCR answer is not valid JSON");
  }
}

/**
 * CA-09.2: turns the model's answer into the merchant, date, time, total, payment and products, each with a 0-1
 * confidence that the server lowers when its own checks fail. Throws OcrError UNREADABLE when nothing useful was
 * read. `today` is the user's date ("2026-11-15").
 */
export function parseOcrAnswer(raw: string, today: string): OcrReading {
  const data = extractJson(raw);
  if (typeof data !== "object" || data === null) {
    throw new OcrError("UNREADABLE", "The OCR answer is not an object");
  }
  const answer = data as Record<string, RawField>;

  const merchant = readText(answer.merchant, DESCRIPTION_MAX_LENGTH);
  const date = readDate(answer.date, today);
  const time = readTime(answer.time);
  const totalCents = toCents(valueOf(answer.total));
  let total: OcrField<string> =
    totalCents !== null && totalCents > 0
      ? { value: centsToAmount(totalCents), confidence: confidenceOf(answer.total) }
      : missing();
  const paymentMethod = readPayment(answer.paymentMethod);

  const parsedItems = (Array.isArray(answer.items) ? answer.items : [])
    .map(readItem)
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const itemsCents = parsedItems.reduce((sum, item) => sum + (item.cents ?? 0), 0);
  const allAmountsRead = parsedItems.length > 0 && parsedItems.every((item) => item.cents !== null);
  const totalMatches = totalCents !== null && allAmountsRead && itemsCents === totalCents;

  let items: OcrItem[] = parsedItems.map(({ cents: _cents, ...item }) => item);
  if (!totalMatches) {
    // The products do not add up to the total: something was misread or skipped (e.g. a discount line), and we
    // cannot tell which value is wrong, so the user has to check the total and the amounts.
    total = cap(total, SUSPICIOUS);
    items = items.map((item) => ({ ...item, amount: cap(item.amount, SUSPICIOUS) }));
  }

  if (!merchant.value && total.value === null && items.length === 0) {
    throw new OcrError("UNREADABLE", "Nothing could be read from the photo");
  }

  return {
    merchant,
    date,
    time,
    total,
    paymentMethod,
    items,
    itemsTotal: centsToAmount(itemsCents),
    totalMatches,
  };
}
