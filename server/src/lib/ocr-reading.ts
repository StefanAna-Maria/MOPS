import {
  DESCRIPTION_MAX_LENGTH,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  isExpenseCategory,
  isIsoDate,
  isPaymentMethod,
  type CategoryOption,
  type DocumentKind,
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
/**
 * Confidence of a value the model read, before the server's checks (2026-11-24). The model no longer reports a
 * confidence (it always said ~0.95, even when wrong, and writing it took most of the reading time); the checks below
 * lower this when a value does not add up or is implausible, which is what marks it "Verifică" (US-11).
 */
const READ = 0.9;
const MAX_AMOUNT_CENTS = 999_999_999;

type RawField = { value?: unknown; confidence?: unknown } | unknown;

function confidenceOf(field: RawField): number {
  const hasWrapper = typeof field === "object" && field !== null && !Array.isArray(field) && "value" in field;
  if (!hasWrapper) {
    // Compact answer: a plain value the model read.
    return READ;
  }
  const raw = "confidence" in field ? field.confidence : undefined;
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

/**
 * US-03: resolves what the model wrote as a category: a NAME from the user's list ("Sală de sport", any case, with
 * or without diacritics) or a built-in code ("GROCERIES", older answers). Unknown → Altele, to be checked.
 */
export type CategoryResolver = (value: unknown) => string | null;

const plain = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

export function categoryResolver(categories: readonly CategoryOption[]): CategoryResolver {
  const byName = new Map(categories.map((category) => [plain(category.name), category.id]));
  const ids = new Set(categories.map((category) => category.id));
  return (value) => {
    if (typeof value !== "string" || !value.trim()) {
      return null;
    }
    const code = value.trim().toUpperCase();
    if (isExpenseCategory(code) && ids.has(code)) {
      return code;
    }
    return byName.get(plain(value)) ?? (ids.has(value.trim()) ? value.trim() : null);
  };
}

/** The 9 built-in categories, for readings without a user's list (and older tests). */
const BUILT_IN_RESOLVER = categoryResolver(
  EXPENSE_CATEGORIES.map((code) => ({ id: code, name: EXPENSE_CATEGORY_LABELS[code], builtIn: true })),
);

function readCategory(field: RawField, resolve: CategoryResolver): OcrField<string> {
  const category = resolve(valueOf(field));
  return category !== null
    ? { value: category, confidence: confidenceOf(field) }
    : { value: "OTHER", confidence: SUSPICIOUS };
}

/** A money value with its confidence, and its cents for the checks (null when it was not read). */
function readMoney(field: RawField): { field: OcrField<string>; cents: number | null } {
  const cents = toCents(valueOf(field));
  return cents === null
    ? { field: missing(), cents: null }
    : { field: { value: centsToAmount(cents), confidence: confidenceOf(field) }, cents };
}

/** Invoice lines may round unit price × quantity to the ban; allow that much difference. */
const LINE_ROUNDING_CENTS = 1;

function readItem(
  raw: unknown,
  isInvoice: boolean,
  resolve: CategoryResolver,
): (OcrItem & { cents: number | null }) | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const item = raw as Record<string, RawField>;
  const name = readText(item.name, DESCRIPTION_MAX_LENGTH);
  if (!name.value) {
    return null;
  }
  const quantityValue = Number(valueOf(item.quantity));
  let quantity: OcrField<number> =
    Number.isFinite(quantityValue) && quantityValue > 0
      ? { value: quantityValue, confidence: confidenceOf(item.quantity) }
      : { value: 1, confidence: GUESSED };
  const read = readMoney(item.amount);
  let amount = read.field;
  let cents = read.cents;
  const category = readCategory(item.category, resolve);

  if (!isInvoice) {
    return { name, quantity, amount, category, cents };
  }

  // Invoice line: unit price WITHOUT VAT, the line's VAT, and the line total WITH VAT.
  // A unit price of 0 (written on discount lines) means "not given", not a free product.
  const unit = toCents(valueOf(item.unitPrice)) === 0 ? { field: missing<string>(), cents: null } : readMoney(item.unitPrice);
  const vat = readMoney(item.vatAmount);
  let unitPrice = unit.field;
  let vatAmount = vat.field;
  if (unit.cents !== null && vat.cents !== null && cents !== null && vat.cents !== 0 && quantity.value !== 1 && Math.abs(cents - unit.cents) <= LINE_ROUNDING_CENTS) {
    // The line value equals ONE unit price, so the quantity is 1: the model took it from the product's name ("5
    // porturi –3 USB-C" read as 3, 2026-11-24). The value without VAT = unit price × quantity proves it.
    quantity = { value: 1, confidence: amount.confidence };
  }
  if (unit.cents !== null && vat.cents !== null) {
    const withoutVat = Math.round(unit.cents * (quantity.value ?? 1));
    const expected = withoutVat + vat.cents;
    if (cents !== null && vat.cents !== 0 && Math.abs(cents - withoutVat) <= LINE_ROUNDING_CENTS) {
      // The model copied the "Valoare (fără TVA)" column as the line total (seen on 2026-11-21): the line total
      // WITH VAT is that value plus the line's VAT. Its confidence is that of the VAT just added.
      cents = expected;
      amount = { value: centsToAmount(expected), confidence: Math.min(amount.confidence, vatAmount.confidence) };
    } else if (cents === null) {
      // The model gave the parts but not the line total: compute it, as sure as the least sure part.
      cents = expected;
      amount = {
        value: centsToAmount(expected),
        confidence: Math.min(unitPrice.confidence, vatAmount.confidence, quantity.confidence),
      };
    } else if (cents < 0 && Math.abs(expected + cents) <= LINE_ROUNDING_CENTS) {
      // A discount written with a positive unit price (15 for a -15 voucher, 2026-11-24): same value, so the unit price
      // is the discount's, with its minus sign.
      unitPrice = { value: centsToAmount(-(unit.cents ?? 0)), confidence: unitPrice.confidence };
    } else if (Math.abs(expected - cents) > LINE_ROUNDING_CENTS) {
      // unit price × quantity + VAT ≠ line total: one of them is misread, and we cannot tell which.
      unitPrice = cap(unitPrice, SUSPICIOUS);
      vatAmount = cap(vatAmount, SUSPICIOUS);
      amount = cap(amount, SUSPICIOUS);
    }
  }
  return { name, quantity, amount, category, unitPrice, vatAmount, cents };
}

function readDocumentKind(answer: Record<string, RawField>): DocumentKind {
  const value = valueOf(answer.documentKind);
  if (typeof value === "string" && value.trim().toUpperCase() === "INVOICE") {
    return "INVOICE";
  }
  // The model said it is a receipt: trust it. Models also write a unit price on receipt lines, and guessing from that
  // turned a Mega Image receipt into a "Factură scanată" (2026-11-24).
  if (typeof value === "string" && value.trim().toUpperCase() === "RECEIPT") {
    return "RECEIPT";
  }
  // A model that forgets to say "INVOICE" but fills in unit prices or VAT per line has read an invoice.
  const items = Array.isArray(answer.items) ? answer.items : [];
  const hasInvoiceColumns = items.some((raw) => {
    const item = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, RawField>;
    return toCents(valueOf(item.unitPrice)) !== null || toCents(valueOf(item.vatAmount)) !== null;
  });
  return hasInvoiceColumns ? "INVOICE" : "RECEIPT";
}

/**
 * The compact answer (2026-11-24) uses short names and one row per product:
 *   {"kind", "merchant", "date", "time", "total", "payment", "items": [[name, quantity, lineTotal, category, unitPrice?, vat?]]}
 * This turns it into the long shape the checks below read. A long answer (older readings, tests) passes unchanged.
 */
/**
 * A product written as a bare row. Positions are not trusted (the model shifted them: a discount row came as
 * ["15% REDUCERE", -4.9, "GROCERIES"], without its quantity): the name is the first text, the category the known
 * code, and the numbers are read as [amount], [quantity, amount] or, on a full invoice row, positionally.
 */
function fromRow(row: unknown[], resolve: CategoryResolver): Record<string, RawField> {
  if (row.length >= 6) {
    return { name: row[0], quantity: row[1], amount: row[2], category: row[3], unitPrice: row[4], vatAmount: row[5] };
  }
  const isCategory = (value: unknown) => resolve(value) !== null;
  const name = row.find((value) => typeof value === "string" && !isCategory(value));
  const category = row.find(isCategory);
  const numbers = row.filter((value) => typeof value === "number" || (typeof value === "string" && toCents(value) !== null && !isCategory(value) && value !== name));
  const [quantity, amount] = numbers.length >= 2 ? numbers : [1, numbers[0]];
  return { name, quantity, amount, category };
}

function fromCompact(answer: Record<string, RawField>, resolve: CategoryResolver): Record<string, RawField> {
  const items = Array.isArray(answer.items)
    ? answer.items.map((item) =>
        Array.isArray(item) ? fromRow(item, resolve) : item,
      )
    : answer.items;
  return {
    ...answer,
    documentKind: answer.documentKind ?? answer.kind,
    paymentMethod: answer.paymentMethod ?? answer.payment,
    items,
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
export function parseOcrAnswer(raw: string, today: string, categories?: readonly CategoryOption[]): OcrReading {
  const resolve = categories ? categoryResolver(categories) : BUILT_IN_RESOLVER;
  const data = extractJson(raw);
  if (typeof data !== "object" || data === null) {
    throw new OcrError("UNREADABLE", "The OCR answer is not an object");
  }
  const answer = fromCompact(data as Record<string, RawField>, resolve);

  const documentKind = readDocumentKind(answer);
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
    .map((item) => readItem(item, documentKind === "INVOICE", resolve))
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
    documentKind,
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
