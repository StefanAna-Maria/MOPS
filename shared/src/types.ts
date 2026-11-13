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
