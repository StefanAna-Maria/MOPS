export const USAGE_TYPES = ["PERSONAL", "COMPANY"] as const;

export type UsageType = (typeof USAGE_TYPES)[number];

export function isUsageType(value: unknown): value is UsageType {
  return typeof value === "string" && (USAGE_TYPES as readonly string[]).includes(value);
}

export type Profile = {
  id: string;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  personalEnabled: boolean;
};

export type Company = {
  id: string;
  ownerId: string;
  cui: string;
  name: string;
  address: string;
  registrationNumber: string | null;
  vatPayer: boolean;
};

export type MeResponse = {
  user: {
    id: string;
    email: string;
    usageType: UsageType;
  };
  profile: Profile;
  company: Company | null;
};

export type DocumentLine = {
  id: string;
  position: number;
  name: string;
  amount: string;
  category: string;
  /** US-09, invoice lines only: the quantity, the price of one unit WITHOUT VAT and the line VAT (amount includes it). */
  quantity?: string | null;
  unitPrice?: string | null;
  vatAmount?: string | null;
};

export type ExpenseDocument = {
  id: string;
  /** "personal", or "company" for a document of the user's company. */
  context: "personal" | "company";
  type: string;
  merchant: string;
  date: string;
  time: string | null;
  total: string;
  category: string;
  /** US-03: the category's name as shown (a built-in label or the name of the user's own category). */
  categoryName?: string;
  paymentMethod: string;
  note: string | null;
  /** The scanned photo (GET /api/scans/:fileId/image), or null for a manual expense. */
  fileId: string | null;
  createdAt: string;
  lines: DocumentLine[];
};

/** US-05 / US-16: total spent in one category during the current month. */
export type CategoryBreakdownItem = {
  category: string;
  categoryName: string;
  total: string;
  /** US-16: integer percentage share of the current month's total; shares across all categories sum to 100%. */
  percent: number;
  count: number;
};

/** US-05: current month's spending summary and variation compared to the previous month. */
export type MonthSummary = {
  /** YYYY-MM of the current month (e.g. "2026-11"). */
  month: string;
  /** Exact total of all documents in the current month for the active profile, with two decimals ("1234.50"). */
  total: string;
  /** Number of documents in the current month for the active profile. */
  count: number;
  /** YYYY-MM of the previous month (e.g. "2026-10"). */
  previousMonth: string;
  /** Exact total of the previous month for the active profile, or null when there were no expenses last month. */
  previousTotal: string | null;
  /** Percentage variation vs. previous month (> 0 spent more, < 0 spent less, 0 same), or null without previous month expenses. */
  variationPercent: number | null;
  /** Current month's spending grouped by category, sorted descending by total. */
  byCategory: CategoryBreakdownItem[];
  /** Previous month's spending grouped by category, sorted descending by total (empty when no previous month expenses). */
  previousByCategory: CategoryBreakdownItem[];
};
