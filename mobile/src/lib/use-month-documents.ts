import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  amountToCents,
  centsToAmount,
  computeCategoryShares,
  EXPENSE_CATEGORY_LABELS,
  isExpenseCategory,
  previousMonthBounds,
  type CategoryBreakdownItem,
  type DocumentContext,
  type DocumentFilter,
  type ExpenseDocument,
  type MonthSummary,
} from "@ocrinvoice/shared";
import { apiFetch } from "./api";
import { localTodayIso } from "./dates";

export type MonthDocumentsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; documents: ExpenseDocument[]; summary: MonthSummary };

type LoadedState = { key: string; state: MonthDocumentsState };

type DocumentsResponse = {
  month?: string;
  documents: ExpenseDocument[];
  summary?: MonthSummary;
};

function fallbackSummary(month: string, documents: ExpenseDocument[]): MonthSummary {
  let totalCents = 0;
  const map = new Map<string, { categoryName: string; cents: number; count: number }>();

  for (const doc of documents) {
    const cents = amountToCents(doc.total);
    totalCents += cents;
    const label =
      doc.categoryName ?? (isExpenseCategory(doc.category) ? EXPENSE_CATEGORY_LABELS[doc.category] : "Altele");
    const entry = map.get(doc.category) ?? { categoryName: label, cents: 0, count: 0 };
    entry.cents += cents;
    entry.count += 1;
    map.set(doc.category, entry);
  }

  const sorted = [...map.entries()]
    .filter(([, { cents }]) => cents > 0)
    .map(([category, { categoryName, cents, count }]) => ({
      category,
      categoryName,
      total: centsToAmount(cents),
      count,
      cents,
    }))
    .sort((a, b) => b.cents - a.cents || a.categoryName.localeCompare(b.categoryName, "ro"));

  const shares = computeCategoryShares(sorted.map((item) => item.cents));
  const byCategory: CategoryBreakdownItem[] = sorted.map(({ cents: _cents, ...item }, index) => ({
    ...item,
    percent: shares[index],
  }));

  const previousMonth = previousMonthBounds(`${month}-01`).start.slice(0, 7);

  return {
    month,
    total: centsToAmount(totalCents),
    count: documents.length,
    previousMonth,
    previousTotal: null,
    variationPercent: null,
    byCategory,
    previousByCategory: [],
  };
}

/**
 * The current month's documents and monthly summary of one profile (GET /api/documents?context=…&type=…). Reloads
 * every time the screen comes into focus and whenever the profile or the filter (US-15) changes; the personal and
 * company lists are never mixed.
 */
export function useMonthDocuments(context: DocumentContext, filter: DocumentFilter = "ALL") {
  const key = `${context}:${filter}`;
  const [loaded, setLoaded] = useState<LoadedState>({ key, state: { status: "loading" } });
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    let next: MonthDocumentsState;
    try {
      const response = await apiFetch(`/api/documents?context=${context}&type=${filter}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data: DocumentsResponse = await response.json();
      const month = data.month ?? localTodayIso().slice(0, 7);
      const summary = data.summary
        ? { ...data.summary, previousByCategory: data.summary.previousByCategory ?? [] }
        : fallbackSummary(month, data.documents);
      next = { status: "ok", documents: data.documents, summary };
    } catch {
      next = { status: "error" };
    }
    // Only the newest request may update the screen (e.g. after switching profiles or filters quickly).
    if (request === latestRequest.current) {
      setLoaded({ key: `${context}:${filter}`, state: next });
    }
  }, [context, filter]);

  const retry = useCallback(() => {
    setLoaded({ key: `${context}:${filter}`, state: { status: "loading" } });
    return load();
  }, [context, filter, load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Right after switching profiles or filters, show loading instead of the previous list.
  const state: MonthDocumentsState = loaded.key === key ? loaded.state : { status: "loading" };
  return { state, retry };
}
