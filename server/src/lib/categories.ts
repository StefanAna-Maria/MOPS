import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  isExpenseCategory,
  type CategoryOption,
  type ExpenseCategory,
} from "@ocrinvoice/shared";
import { prisma } from "./prisma.js";

/** "Altele" is the default category: it can never be hidden. */
export const DEFAULT_CATEGORY: ExpenseCategory = "OTHER";

/** The user's own categories: id → name. */
export async function customCategoryNames(userId: string): Promise<Map<string, string>> {
  const rows = await prisma.category.findMany({ where: { userId }, select: { id: true, name: true } });
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** The name shown for a category id: a built-in label, or the user's own category's name. */
export function categoryName(category: string, custom: Map<string, string>): string {
  if (isExpenseCategory(category)) {
    return EXPENSE_CATEGORY_LABELS[category];
  }
  return custom.get(category) ?? EXPENSE_CATEGORY_LABELS[DEFAULT_CATEGORY];
}

/**
 * US-03: the categories offered for a new expense: the built-in ones the user did not hide, then their own (oldest
 * first), with "Altele" last — or in the order the user chose, with categories added since then just before
 * "Altele" (or at the end if the user moved it).
 */
export async function listCategories(userId: string): Promise<CategoryOption[]> {
  const [profile, custom] = await Promise.all([
    prisma.profile.findUnique({ where: { userId }, select: { hiddenCategories: true, categoryOrder: true } }),
    prisma.category.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
  ]);
  const hidden = new Set(profile?.hiddenCategories ?? []);
  const builtIn = EXPENSE_CATEGORIES.filter((code) => code !== DEFAULT_CATEGORY && !hidden.has(code)).map((code) => ({
    id: code,
    name: EXPENSE_CATEGORY_LABELS[code],
    builtIn: true,
  }));
  const standard: CategoryOption[] = [
    ...builtIn,
    ...custom.map((row) => ({ id: row.id, name: row.name, builtIn: false })),
    { id: DEFAULT_CATEGORY, name: EXPENSE_CATEGORY_LABELS[DEFAULT_CATEGORY], builtIn: true },
  ];
  return applyOrder(standard, profile?.categoryOrder ?? []);
}

/** Puts the categories in the user's order; ones not in it (added since) go just before "Altele", or at the end. */
export function applyOrder(categories: CategoryOption[], order: string[]): CategoryOption[] {
  if (order.length === 0) {
    return categories;
  }
  const byId = new Map(categories.map((category) => [category.id, category]));
  const result = order.flatMap((id) => {
    const category = byId.get(id);
    byId.delete(id);
    return category ? [category] : [];
  });
  for (const category of categories.filter((item) => byId.has(item.id))) {
    const otherIndex = result.findIndex((item) => item.id === DEFAULT_CATEGORY);
    if (category.id !== DEFAULT_CATEGORY && otherIndex !== -1) {
      result.splice(otherIndex, 0, category);
    } else {
      result.push(category);
    }
  }
  return result;
}

/** Whether the category can be used by this user: a built-in code, or one of their own categories. */
export async function isUsersCategory(userId: string, category: string): Promise<boolean> {
  if (isExpenseCategory(category)) {
    return true;
  }
  return (await prisma.category.count({ where: { id: category, userId } })) > 0;
}

/** How many of the user's documents use the category (on the document or on one of its lines). */
export function countDocumentsUsing(userId: string, category: string): Promise<number> {
  return prisma.document.count({
    where: { userId, OR: [{ category }, { lines: { some: { category } } }] },
  });
}
