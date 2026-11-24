import {
  DOCUMENT_TYPE_LABELS,
  EXPENSE_CATEGORY_LABELS,
  isExpenseCategory,
  type DocumentType,
  type ExpenseDocument,
} from "@ocrinvoice/shared";

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

/** 123450 → "1.234,50 lei", -320 → "-3,20 lei" (Romanian format: dot for thousands, comma for decimals). */
export function formatLei(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const units = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimals = String(abs % 100).padStart(2, "0");
  return `${sign}${units},${decimals} lei`;
}

function shiftDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** CA-04.1: "ASTĂZI", "IERI" or "JOI, 23 OCTOMBRIE". */
export function dayLabel(isoDate: string, today: string): string {
  if (isoDate === today) {
    return "ASTĂZI";
  }
  if (isoDate === shiftDays(today, -1)) {
    return "IERI";
  }
  const date = new Date(`${isoDate}T00:00:00Z`);
  return `${WEEKDAYS[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** CA-04.3: "Alimente · Cheltuială manuală". */
export function documentSubtitle(document: ExpenseDocument): string {
  // US-03: the server names the category (a built-in label or the user's own category).
  const category =
    document.categoryName ??
    (isExpenseCategory(document.category) ? EXPENSE_CATEGORY_LABELS[document.category] : "Altele");
  const type = DOCUMENT_TYPE_LABELS[document.type as DocumentType] ?? document.type;
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
