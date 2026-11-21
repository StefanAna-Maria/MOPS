import {
  MAX_AMOUNT_CENTS,
  isDescriptionValid,
  isExpenseCategory,
  isIsoDate,
  isPaymentDateValid,
  isPaymentMethod,
  parseAmount,
  type ExpenseCategory,
  type PaymentMethod,
} from "./expense.js";

export function parseLineAmount(input: string): string | null {
  const match = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!match) {
    return null;
  }
  const units = match[2].replace(/^0+(?=\d)/, "");
  const decimals = (match[3] ?? "").padEnd(2, "0");
  if (units.length > 7) {
    return null;
  }
  const cents = Number(units) * 100 + Number(decimals);
  if (cents > MAX_AMOUNT_CENTS) {
    return null;
  }
  return cents === 0 ? "0.00" : `${match[1]}${units}.${decimals}`;
}

function toCents(amount: string) {
  const [units, decimals] = amount.replace("-", "").split(".");
  const cents = Number(units) * 100 + Number(decimals);
  return amount.startsWith("-") ? -cents : cents;
}

function fromCents(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export type TotalCheck = {
  itemsTotal: string;
  difference: string;
  matches: boolean;
};

export function checkTotal(total: string | null, amounts: (string | null)[]): TotalCheck {
  const read = amounts.filter((amount): amount is string => amount !== null);
  const itemsCents = read.reduce((sum, amount) => sum + toCents(amount), 0);
  const totalCents = total === null ? null : toCents(total);
  const complete = totalCents !== null && amounts.length > 0 && read.length === amounts.length;
  return {
    itemsTotal: fromCents(itemsCents),
    difference: fromCents(Math.abs((totalCents ?? 0) - itemsCents)),
    matches: complete && totalCents === itemsCents,
  };
}

export function suggestCategory(
  items: { amount: string | null; category: ExpenseCategory | null }[],
): ExpenseCategory {
  const spent = new Map<ExpenseCategory, number>();
  for (const item of items) {
    if (item.amount !== null && item.category !== null) {
      spent.set(item.category, (spent.get(item.category) ?? 0) + toCents(item.amount));
    }
  }
  let best: ExpenseCategory = "OTHER";
  let bestCents = 0;
  for (const [category, cents] of spent) {
    if (cents > bestCents) {
      best = category;
      bestCents = cents;
    }
  }
  return best;
}

export type ScannedDocumentItem = {
  name: string;
  amount: string;
  category: ExpenseCategory;
};

export type ScannedDocumentInput = {
  merchant: string;
  date: string;
  time: string | null;
  total: string;
  paymentMethod: PaymentMethod;
  category: ExpenseCategory;
  items: ScannedDocumentItem[];
};

export type ScannedDocumentField =
  | "merchant"
  | "date"
  | "time"
  | "total"
  | "paymentMethod"
  | "category"
  | "items"
  | "itemsTotal";

export type ScannedDocumentValidation =
  | { ok: true; value: ScannedDocumentInput }
  | { ok: false; fields: ScannedDocumentField[] };

function readItem(raw: unknown): ScannedDocumentItem | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const item = raw as Record<string, unknown>;
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const amount = typeof item.amount === "string" ? parseLineAmount(item.amount) : null;
  if (!isDescriptionValid(name) || !amount || !isExpenseCategory(item.category)) {
    return null;
  }
  return { name, amount, category: item.category };
}

export function validateScannedDocument(
  body: unknown,
  today: string,
  currentTime?: string,
): ScannedDocumentValidation {
  const data = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const fields: ScannedDocumentField[] = [];

  const merchant = typeof data.merchant === "string" ? data.merchant.trim() : "";
  if (!isDescriptionValid(merchant)) {
    fields.push("merchant");
  }

  const date = isIsoDate(data.date) ? data.date : null;
  if (!isPaymentDateValid(date, today)) {
    fields.push("date");
  }

  const time = data.time === undefined || data.time === null ? null : data.time;
  const timeValid = time === null || (typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
  const timeInFuture = timeValid && time !== null && date === today && currentTime !== undefined && time > currentTime;
  if (!timeValid || timeInFuture) {
    fields.push("time");
  }

  const total = typeof data.total === "string" ? parseAmount(data.total) : null;
  if (!total) {
    fields.push("total");
  }

  if (!isPaymentMethod(data.paymentMethod)) {
    fields.push("paymentMethod");
  }

  if (!isExpenseCategory(data.category)) {
    fields.push("category");
  }

  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items = rawItems.map(readItem);
  const validItems = items.filter((item): item is ScannedDocumentItem => item !== null);
  if (rawItems.length === 0 || validItems.length !== rawItems.length) {
    fields.push("items");
  }

  if (fields.length > 0) {
    return { ok: false, fields };
  }

  if (!checkTotal(total, validItems.map((item) => item.amount)).matches) {
    return { ok: false, fields: ["itemsTotal"] };
  }

  return {
    ok: true,
    value: {
      merchant,
      date: date as string,
      time: time as string | null,
      total: total as string,
      paymentMethod: data.paymentMethod as PaymentMethod,
      category: data.category as ExpenseCategory,
      items: validItems,
    },
  };
}
