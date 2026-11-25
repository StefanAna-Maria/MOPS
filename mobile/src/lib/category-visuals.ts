import type Ionicons from "@expo/vector-icons/Ionicons";

export type CategoryVisual = {
  /** Vibrant color used on dark/teal cards and progress bars. */
  color: string;
  /** High-contrast accent used on light/white cards. */
  accent: string;
  /** Soft pastel background for icon circles and percentage pills on white cards. */
  tint: string;
  /** Ionicons icon name for this category. */
  icon: keyof typeof Ionicons.glyphMap;
};

const BUILT_IN_VISUALS: Record<string, CategoryVisual> = {
  GROCERIES: { color: "#FBBF24", accent: "#D97706", tint: "#FEF3C7", icon: "cart-outline" },
  RESTAURANTS: { color: "#FB7185", accent: "#E11D48", tint: "#FFE4E6", icon: "restaurant-outline" },
  TRANSPORT: { color: "#38BDF8", accent: "#0284C7", tint: "#E0F2FE", icon: "car-outline" },
  HOUSING: { color: "#A78BFA", accent: "#7C3AED", tint: "#EDE9FE", icon: "home-outline" },
  HEALTH: { color: "#34D399", accent: "#059669", tint: "#D1FAE5", icon: "medkit-outline" },
  SHOPPING: { color: "#F472B6", accent: "#DB2777", tint: "#FCE7F3", icon: "bag-handle-outline" },
  ENTERTAINMENT: { color: "#FACC15", accent: "#CA8A04", tint: "#FEF9C3", icon: "film-outline" },
  EDUCATION: { color: "#60A5FA", accent: "#2563EB", tint: "#DBEAFE", icon: "school-outline" },
  OTHER: { color: "#CBD5E1", accent: "#475569", tint: "#F1F5F9", icon: "folder-outline" },
};

const CUSTOM_VISUAL_PALETTE: CategoryVisual[] = [
  { color: "#FB923C", accent: "#EA580C", tint: "#FFEDD5", icon: "pricetag-outline" },
  { color: "#E879F9", accent: "#C026D3", tint: "#FAE8FF", icon: "pricetag-outline" },
  { color: "#4ADE80", accent: "#16A34A", tint: "#DCFCE7", icon: "pricetag-outline" },
  { color: "#22D3EE", accent: "#0891B2", tint: "#CFFAFE", icon: "pricetag-outline" },
  { color: "#C084FC", accent: "#9333EA", tint: "#F3E8FF", icon: "pricetag-outline" },
  { color: "#FDE047", accent: "#A16207", tint: "#FEF9C3", icon: "pricetag-outline" },
];

/** Returns a deterministic vibrant color, accent, pastel tint and icon for any built-in or custom category. */
export function categoryVisual(code: string): CategoryVisual {
  if (BUILT_IN_VISUALS[code]) {
    return BUILT_IN_VISUALS[code];
  }
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) {
    hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  }
  return CUSTOM_VISUAL_PALETTE[hash % CUSTOM_VISUAL_PALETTE.length];
}

