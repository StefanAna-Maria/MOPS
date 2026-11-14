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
  const [units, decimals = ""] = amount.split(".");
  return Number(units) * 100 + Number(decimals.padEnd(2, "0").slice(0, 2));
}

/** 123450 → "1.234,50 lei" (Romanian format: dot for thousands, comma for decimals). */
export function formatLei(cents: number): string {
  const units = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimals = String(cents % 100).padStart(2, "0");
  return `${units},${decimals} lei`;
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
  const category = isExpenseCategory(document.category) ? EXPENSE_CATEGORY_LABELS[document.category] : "Altele";
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
