export const DESCRIPTION_MAX_LENGTH = 120;
export const NOTE_MAX_LENGTH = 500;
export const MAX_AMOUNT_CENTS = 999_999_999;
export const DEFAULT_TIME_ZONE = "Europe/Bucharest";

export const EXPENSE_CATEGORIES = [
  "GROCERIES",
  "RESTAURANTS",
  "TRANSPORT",
  "HOUSING",
  "HEALTH",
  "SHOPPING",
  "ENTERTAINMENT",
  "EDUCATION",
  "OTHER",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  GROCERIES: "Alimente",
  RESTAURANTS: "Restaurante și cafenele",
  TRANSPORT: "Transport",
  HOUSING: "Casă și utilități",
  HEALTH: "Sănătate",
  SHOPPING: "Cumpărături",
  ENTERTAINMENT: "Timp liber",
  EDUCATION: "Educație",
  OTHER: "Altele",
};

export const DEFAULT_EXPENSE_CATEGORY: ExpenseCategory = "OTHER";

export const PAYMENT_METHODS = ["CASH", "CARD", "TRANSFER"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Numerar",
  CARD: "Card",
  TRANSFER: "Transfer",
};

export const DEFAULT_PAYMENT_METHOD: PaymentMethod = "CASH";

export const DOCUMENT_TYPES = ["MANUAL", "SCANNED"] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  MANUAL: "Cheltuială manuală",
  SCANNED: "Bon scanat",
};

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === "string" && (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/**
 * Accepts "12", "12,5", "12.50" (comma or dot, at most two decimals, greater than 0)
 * and returns the amount normalized as "12.50", or null when it is not valid.
 */
export function parseAmount(input: string): string | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!match) {
    return null;
  }
  const units = match[1].replace(/^0+(?=\d)/, "");
  const decimals = (match[2] ?? "").padEnd(2, "0");
  if (units.length > 7) {
    return null;
  }
  const cents = Number(units) * 100 + Number(decimals);
  if (cents <= 0 || cents > MAX_AMOUNT_CENTS) {
    return null;
  }
  return `${units}.${decimals}`;
}

function isCalendarDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** "14.11.2026" → "2026-11-14", or null when it is not a real date in the format ZZ.LL.AAAA. */
export function parseDisplayDate(input: string): string | null {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(input.trim());
  if (!match) {
    return null;
  }
  const [, day, month, year] = match;
  if (!isCalendarDate(Number(year), Number(month), Number(day))) {
    return null;
  }
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** "2026-11-14" → "14.11.2026". */
export function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return !!match && isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || !timeZone) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Today's date ("2026-11-14") in the given time zone. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** A payment date is valid when it is a real date and not later than today (ISO dates compare as strings). */
export function isPaymentDateValid(isoDate: string | null, today: string): boolean {
  return !!isoDate && isIsoDate(isoDate) && isoDate <= today;
}

export function isDescriptionValid(description: string): boolean {
  const trimmed = description.trim();
  return trimmed.length > 0 && trimmed.length <= DESCRIPTION_MAX_LENGTH;
}

export function isNoteValid(note: string): boolean {
  return note.trim().length <= NOTE_MAX_LENGTH;
}

export type ManualExpenseInput = {
  description: string;
  amount: string;
  date: string;
  category: ExpenseCategory;
  paymentMethod: PaymentMethod;
  note: string | null;
};

export type ManualExpenseField = "description" | "amount" | "date" | "category" | "paymentMethod" | "note";

export type ManualExpenseValidation =
  | { ok: true; value: ManualExpenseInput }
  | { ok: false; fields: ManualExpenseField[] };

/** Validates a manual expense received as untrusted JSON. `today` is the user's current date ("2026-11-14"). */
export function validateManualExpense(body: unknown, today: string): ManualExpenseValidation {
  const data = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const fields: ManualExpenseField[] = [];

  const description = typeof data.description === "string" ? data.description.trim() : "";
  if (!isDescriptionValid(description)) {
    fields.push("description");
  }

  const amount = typeof data.amount === "string" ? parseAmount(data.amount) : null;
  if (!amount) {
    fields.push("amount");
  }

  const date = isIsoDate(data.date) ? data.date : null;
  if (!isPaymentDateValid(date, today)) {
    fields.push("date");
  }

  const category = data.category === undefined ? DEFAULT_EXPENSE_CATEGORY : data.category;
  if (!isExpenseCategory(category)) {
    fields.push("category");
  }

  const paymentMethod = data.paymentMethod === undefined ? DEFAULT_PAYMENT_METHOD : data.paymentMethod;
  if (!isPaymentMethod(paymentMethod)) {
    fields.push("paymentMethod");
  }

  const rawNote = data.note === undefined || data.note === null ? "" : data.note;
  if (typeof rawNote !== "string" || !isNoteValid(rawNote)) {
    fields.push("note");
  }

  if (fields.length > 0) {
    return { ok: false, fields };
  }

  const note = (rawNote as string).trim();
  return {
    ok: true,
    value: {
      description,
      amount: amount as string,
      date: date as string,
      category: category as ExpenseCategory,
      paymentMethod: paymentMethod as PaymentMethod,
      note: note ? note : null,
    },
  };
}

/** The month containing `isoDate`: its first day and the first day of the next month (exclusive). */
export function monthBounds(isoDate: string): { start: string; end: string } {
  const [year, month] = isoDate.split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { start: `${year}-${pad(month)}-01`, end: `${nextYear}-${pad(nextMonth)}-01` };
}

/** Which profile a document belongs to: the personal one, or the user's company. */
export const DOCUMENT_CONTEXTS = ["personal", "company"] as const;

export type DocumentContext = (typeof DOCUMENT_CONTEXTS)[number];

export function isDocumentContext(value: unknown): value is DocumentContext {
  return typeof value === "string" && (DOCUMENT_CONTEXTS as readonly string[]).includes(value);
}
