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
  paymentMethod: string;
  note: string | null;
  /** The scanned photo (GET /api/scans/:fileId/image), or null for a manual expense. */
  fileId: string | null;
  createdAt: string;
  lines: DocumentLine[];
};
