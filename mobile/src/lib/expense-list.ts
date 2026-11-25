import {
  amountToCents,
  DOCUMENT_TYPE_LABELS,
  EXPENSE_CATEGORY_LABELS,
  isExpenseCategory,
  type DocumentType,
  type ExpenseDocument,
} from "@ocrinvoice/shared";
import { formatMoney, getLanguage, t } from "@/i18n";

export { amountToCents };

const WEEKDAYS = ["DUMINICĂ", "LUNI", "MARȚI", "MIERCURI", "JOI", "VINERI", "SÂMBĂTĂ"];
const MONTHS = [
  "IANUARIE",
  "FEBRUARIE",
  "MARTIE",
  "APRILIE",
  "MAI",
  "IUNIE",
  "IULIE",
  "AUGUST",
  "SEPTEMBRIE",
  "OCTOMBRIE",
  "NOIEMBRIE",
  "DECEMBRIE",
];

export type DaySection = {
  date: string;
  title: string;
  totalCents: number;
  data: ExpenseDocument[];
};

/** "12.50" → 1250. Amounts come from the server with exactly two decimals. */
export function amountToCents(amount: string): number {
  // Discounts read from receipts are negative ("-3.20"): the sign applies to the decimals too.
  const negative = amount.trim().startsWith("-");
  const [units, decimals = ""] = amount.trim().replace(/^-/, "").split(".");
  const cents = Number(units) * 100 + Number(decimals.padEnd(2, "0").slice(0, 2));
  return negative ? -cents : cents;
}

/** CA-17.3: 123450 → "1.234,50 lei" in Romanian, "1,234.50 RON" in English (see formatMoney). */
export function formatLei(cents: number): string {
  return formatMoney(cents);
}

function shiftDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** CA-04.1: "ASTĂZI", "IERI" or "JOI, 23 OCTOMBRIE" (in English "TODAY", "YESTERDAY", "THURSDAY, OCTOBER 23"). */
export function dayLabel(isoDate: string, today: string): string {
  const { dates } = t();
  if (isoDate === today) {
    return dates.today;
  }
  if (isoDate === shiftDays(today, -1)) {
    return dates.yesterday;
  }
  const date = new Date(`${isoDate}T00:00:00Z`);
  const weekday = dates.weekdays[date.getUTCDay()];
  const month = dates.months[date.getUTCMonth()];
  return getLanguage() === "en"
    ? `${weekday}, ${month} ${date.getUTCDate()}`
    : `${weekday}, ${date.getUTCDate()} ${month}`;
}

/** A category's name: a built-in one in the current language, the user's own one as they named it (US-03). */
export function categoryLabel(code: string, customName?: string | null): string {
  if (isExpenseCategory(code)) {
    return t().categories[code];
  }
  return customName ?? t().categories.OTHER;
}

/** CA-04.3: "Alimente · Cheltuială manuală". */
export function documentSubtitle(document: ExpenseDocument): string {
  const category = categoryLabel(document.category, document.categoryName);
  const type = t().documentTypes[document.type] ?? document.type;
  return `${category} · ${type}`;
}

/** CA-04.1 / CA-04.2: groups documents (already sorted newest first) by day, with each day's total. */
export function groupByDay(documents: ExpenseDocument[], today: string): DaySection[] {
  const sections: DaySection[] = [];
  for (const document of documents) {
    let section = sections[sections.length - 1];
    if (!section || section.date !== document.date) {
      section = { date: document.date, title: dayLabel(document.date, today), totalCents: 0, data: [] };
      sections.push(section);
    }
    section.data.push(document);
    section.totalCents += amountToCents(document.total);
  }
  return sections;
}
