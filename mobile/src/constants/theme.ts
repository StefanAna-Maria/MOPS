import type { TextStyle, ViewStyle } from "react-native";

export const colors = {
  primary: "#0D9488",
  primaryActive: "#0F766E",
  primaryTint: "#F0FDFA",
  navy: "#0F172A",
  success: "#10B981",
  successText: "#065F46",
  warning: "#F59E0B",
  error: "#EF4444",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  textPrimary: "#0F172A",
  textSecondary: "#64748B",
  textBody: "#334155",
  white: "#FFFFFF",
};

export const fonts = {
  headingBold: "PlusJakartaSans_700Bold",
  headingSemiBold: "PlusJakartaSans_600SemiBold",
  body: "Inter_400Regular",
  bodySemiBold: "Inter_600SemiBold",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 4,
  base: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const typography = {
  headlineXl: { fontFamily: fonts.headingBold, fontSize: 26, lineHeight: 34 },
  headlineLg: { fontFamily: fonts.headingSemiBold, fontSize: 20, lineHeight: 28 },
  headlineMd: { fontFamily: fonts.headingSemiBold, fontSize: 18, lineHeight: 26 },
  headlineSm: { fontFamily: fonts.headingSemiBold, fontSize: 16, lineHeight: 24 },
  bodyLg: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  bodyMd: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  bodySm: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 14, lineHeight: 20 },
  button: { fontFamily: fonts.headingSemiBold, fontSize: 15, lineHeight: 20 },
} satisfies Record<string, TextStyle>;

export const elevation = {
  level1: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: "0 1px 2px 0 rgba(15, 23, 42, 0.04)",
  },
  level2: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    boxShadow: "0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)",
  },
} satisfies Record<string, ViewStyle>;
