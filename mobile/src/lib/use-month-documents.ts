import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import type { DocumentContext, ExpenseDocument } from "@ocrinvoice/shared";
import { apiFetch } from "./api";

export type MonthDocumentsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; documents: ExpenseDocument[] };

type LoadedState = { context: DocumentContext; state: MonthDocumentsState };

/**
 * The current month's documents of one profile (GET /api/documents?context=…). Reloads every time the screen
 * comes into focus and whenever the profile changes; the personal and company lists are never mixed.
 */
export function useMonthDocuments(context: DocumentContext) {
  const [loaded, setLoaded] = useState<LoadedState>({ context, state: { status: "loading" } });
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    let next: MonthDocumentsState;
    try {
      const response = await apiFetch(`/api/documents?context=${context}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data: { documents: ExpenseDocument[] } = await response.json();
      next = { status: "ok", documents: data.documents };
    } catch {
      next = { status: "error" };
    }
    // Only the newest request may update the screen (e.g. after switching profiles quickly).
    if (request === latestRequest.current) {
      setLoaded({ context, state: next });
    }
  }, [context]);

  const retry = useCallback(() => {
    setLoaded({ context, state: { status: "loading" } });
    return load();
  }, [context, load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Right after switching profiles, show loading instead of the other profile's documents.
  const state: MonthDocumentsState = loaded.context === context ? loaded.state : { status: "loading" };
  return { state, retry };
}
