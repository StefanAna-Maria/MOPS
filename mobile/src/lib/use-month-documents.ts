import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import type { DocumentContext, DocumentFilter, ExpenseDocument } from "@ocrinvoice/shared";
import { apiFetch } from "./api";

export type MonthDocumentsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; documents: ExpenseDocument[] };

type LoadedState = { key: string; state: MonthDocumentsState };

/**
 * The current month's documents of one profile (GET /api/documents?context=…&type=…). Reloads every time the screen
 * comes into focus and whenever the profile or the filter (US-15) changes; the personal and company lists are never
 * mixed.
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
      const data: { documents: ExpenseDocument[] } = await response.json();
      next = { status: "ok", documents: data.documents };
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
