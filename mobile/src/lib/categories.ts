import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type CategoryOption,
} from "@ocrinvoice/shared";
import { apiFetch } from "./api";

/** The 9 built-in categories, used until (or if) the user's list cannot be loaded. */
export const BUILT_IN_CATEGORIES: CategoryOption[] = EXPENSE_CATEGORIES.map((id) => ({
  id,
  name: EXPENSE_CATEGORY_LABELS[id],
  builtIn: true,
}));

export type CategoryError = "IN_USE" | "EXISTS" | "INVALID" | "REQUIRED" | "NETWORK";

export type CategoryResult<T> = { ok: true; value: T } | { ok: false; error: CategoryError; count?: number };

/** US-03: the categories offered for a new expense (built-in ones not hidden, the user's own, then Altele). */
export async function fetchCategories(): Promise<CategoryOption[]> {
  const response = await apiFetch("/api/categories");
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = (await response.json().catch(() => null)) as { categories?: unknown } | null;
  if (!Array.isArray(data?.categories)) {
    throw new Error("No category list in the answer");
  }
  return data.categories as CategoryOption[];
}

export async function createCategory(name: string): Promise<CategoryResult<CategoryOption>> {
  try {
    const response = await apiFetch("/api/categories", { method: "POST", body: JSON.stringify({ name }) });
    if (response.ok) {
      const data: { category: CategoryOption } = await response.json();
      return { ok: true, value: data.category };
    }
    return { ok: false, error: response.status === 409 ? "EXISTS" : "INVALID" };
  } catch {
    return { ok: false, error: "NETWORK" };
  }
}

/** Deletes one of the user's own categories, or hides a built-in one. Refused while an expense uses it. */
export async function deleteCategory(id: string): Promise<CategoryResult<null>> {
  try {
    const response = await apiFetch(`/api/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) {
      return { ok: true, value: null };
    }
    const data = await response.json().catch(() => null);
    if (data?.code === "CATEGORY_IN_USE") {
      return { ok: false, error: "IN_USE", count: typeof data.count === "number" ? data.count : undefined };
    }
    return { ok: false, error: data?.code === "CATEGORY_REQUIRED" ? "REQUIRED" : "INVALID" };
  } catch {
    return { ok: false, error: "NETWORK" };
  }
}

/** US-03: saves the order of the user's categories; resolves with the list in its new order. */
export async function saveCategoryOrder(order: string[]): Promise<CategoryResult<CategoryOption[]>> {
  try {
    const response = await apiFetch("/api/categories/order", { method: "PUT", body: JSON.stringify({ order }) });
    if (!response.ok) {
      return { ok: false, error: "INVALID" };
    }
    const data = (await response.json().catch(() => null)) as { categories?: unknown } | null;
    if (!Array.isArray(data?.categories)) {
      return { ok: false, error: "INVALID" };
    }
    return { ok: true, value: data.categories as CategoryOption[] };
  } catch {
    return { ok: false, error: "NETWORK" };
  }
}
