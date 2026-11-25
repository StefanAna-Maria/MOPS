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

export const DOCUMENT_TYPES = ["MANUAL", "SCANNED", "SCANNED_INVOICE"] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  MANUAL: "Cheltuială manuală",
  SCANNED: "Bon scanat",
  SCANNED_INVOICE: "Factură scanată",
};

/** US-15: the filters above the list on Acasă, and the document types each one shows (null = all of them). */
export const DOCUMENT_FILTERS = ["ALL", "RECEIPTS", "INVOICES", "MANUAL"] as const;

export type DocumentFilter = (typeof DOCUMENT_FILTERS)[number];

export const DOCUMENT_FILTER_LABELS: Record<DocumentFilter, string> = {
  ALL: "Toate",
  RECEIPTS: "Bonuri",
  INVOICES: "Facturi",
  MANUAL: "Manuale",
};

export const DOCUMENT_FILTER_TYPES: Record<DocumentFilter, readonly DocumentType[] | null> = {
  ALL: null,
  RECEIPTS: ["SCANNED"],
  INVOICES: ["SCANNED_INVOICE"],
  MANUAL: ["MANUAL"],
};

export const DEFAULT_DOCUMENT_FILTER: DocumentFilter = "ALL";

export function isDocumentFilter(value: unknown): value is DocumentFilter {
  return typeof value === "string" && (DOCUMENT_FILTERS as readonly string[]).includes(value);
}

/** CA-15.2: "1 înregistrare", "5 înregistrări", "20 de înregistrări" (Romanian puts "de" after 20, 21, … 100, …). */
export function formatRecordCount(count: number): string {
  if (count === 1) {
    return "1 înregistrare";
  }
  const lastTwo = count % 100;
  return lastTwo >= 1 && lastTwo <= 19 ? `${count} înregistrări` : count === 0 ? "0 înregistrări" : `${count} de înregistrări`;
}

/** US-03: a category name is 1-30 characters. */
export const CATEGORY_NAME_MAX_LENGTH = 30;

/** US-03: a category the user created is stored by its id (a cuid, e.g. "cmwujd9qb0000x4uoqhfkjt6x"). */
export function isCustomCategoryId(value: unknown): value is string {
  return typeof value === "string" && /^c[a-z0-9]{20,40}$/.test(value);
}

/** US-03: one category the user can choose: a built-in one (id = its code) or their own (id = its database id). */
export type CategoryOption = {
  id: string;
  name: string;
  builtIn: boolean;
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

/** The current time ("14:05") in the given time zone. */
export function timeInTimeZone(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("hour")}:${part("minute")}`;
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
  /** A built-in code ("GROCERIES") or the id of one of the user's own categories (US-03). */
  category: string;
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
  if (!isExpenseCategory(category) && !isCustomCategoryId(category)) {
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
      category: category as string,
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

/** US-05: the calendar month immediately before `isoDate`: its first day and the first day of `isoDate`'s month (exclusive). */
export function previousMonthBounds(isoDate: string): { start: string; end: string } {
  const [year, month] = isoDate.split("-").map(Number);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { start: `${prevYear}-${pad(prevMonth)}-01`, end: `${year}-${pad(month)}-01` };
}

/** US-05: lowercase Romanian month names for "Cheltuit în {lună}" and "față de {lună}". */
export const ROMANIAN_MONTH_NAMES = [
  "ianuarie",
  "februarie",
  "martie",
  "aprilie",
  "mai",
  "iunie",
  "iulie",
  "august",
  "septembrie",
  "octombrie",
  "noiembrie",
  "decembrie",
] as const;

/** "2026-11" or "2026-11-14" → "noiembrie". */
export function monthNameRo(yearMonthOrDate: string): string {
  const [, monthStr] = yearMonthOrDate.split("-");
  const index = Number(monthStr) - 1;
  return ROMANIAN_MONTH_NAMES[index] ?? yearMonthOrDate;
}

/** "12.50" → 1250, "-3.20" → -320. Exact integer-ban conversion with no floating-point error (CA-05.3). */
export function amountToCents(amount: string): number {
  const trimmed = amount.trim();
  const negative = trimmed.startsWith("-");
  const [units, decimals = ""] = trimmed.replace(/^-/, "").split(".");
  const cents = Number(units) * 100 + Number(decimals.padEnd(2, "0").slice(0, 2));
  return negative ? -cents : cents;
}

/** 1250 → "12.50", 0 → "0.00", -320 → "-3.20". Exact integer-ban formatting with two decimals (CA-05.3). */
export function centsToAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const units = Math.floor(abs / 100);
  const decimals = String(abs % 100).padStart(2, "0");
  return `${sign}${units}.${decimals}`;
}

/**
 * CA-05.2: percentage change from `previousCents` to `currentCents`.
 * Returns null when there were no expenses in the previous month (`previousCents` is null or <= 0).
 * Positive means spent more (red), negative means spent less (green), 0 means identical.
 */
export function monthVariationPercent(currentCents: number, previousCents: number | null): number | null {
  if (previousCents === null || previousCents <= 0) {
    return null;
  }
  if (currentCents === previousCents) {
    return 0;
  }
  const raw = ((currentCents - previousCents) / previousCents) * 100;
  const rounded = Math.round(raw);
  if (rounded !== 0) {
    return rounded;
  }
  // Tiny non-zero difference (< 0.5%): keep one decimal so the sign and color stay faithful to the true direction.
  const oneDecimal = Number(raw.toFixed(1));
  return oneDecimal !== 0 ? oneDecimal : raw > 0 ? 0.1 : -0.1;
}

/** CA-05.2: formats a variation percentage for display: 18 → "+18%", -12 → "-12%", 0 → "0%", 0.2 → "+0,2%". */
export function formatVariationPercent(percent: number): string {
  const sign = percent > 0 ? "+" : "";
  const formatted = Number.isInteger(percent) ? String(percent) : percent.toFixed(1).replace(".", ",");
  return `${sign}${formatted}%`;
}

/**
 * CA-16.2: computes integer percentage shares that sum to exactly 100% using the largest-remainder method.
 * Input values must be non-negative cents; returns an array of integers matching the input order.
 */
export function computeCategoryShares(centsList: readonly number[]): number[] {
  const total = centsList.reduce((sum, cents) => sum + cents, 0);
  if (centsList.length === 0 || total <= 0) {
    return centsList.map(() => 0);
  }
  const exact = centsList.map((cents) => (cents / total) * 100);
  const floors = exact.map((value) => Math.floor(value));
  let remaining = 100 - floors.reduce((sum, value) => sum + value, 0);

  const order = exact
    .map((value, index) => ({ index, remainder: value - floors[index], cents: centsList[index] }))
    .sort((a, b) => b.remainder - a.remainder || b.cents - a.cents || a.index - b.index);

  const shares = [...floors];
  for (let i = 0; i < remaining; i += 1) {
    shares[order[i].index] += 1;
  }
  return shares;
}

/** Which profile a document belongs to: the personal one, or the user's company. */
export const DOCUMENT_CONTEXTS = ["personal", "company"] as const;

export type DocumentContext = (typeof DOCUMENT_CONTEXTS)[number];

export function isDocumentContext(value: unknown): value is DocumentContext {
  return typeof value === "string" && (DOCUMENT_CONTEXTS as readonly string[]).includes(value);
}
