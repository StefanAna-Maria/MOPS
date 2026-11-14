import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import type { ExpenseDocument } from "@ocrinvoice/shared";
import { apiFetch } from "./api";

export type MonthDocumentsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; documents: ExpenseDocument[] };

/**
 * The current month's documents (GET /api/documents). Reloads every time the screen comes into focus,
 * so an expense added on another screen appears when the user returns.
 */
export function useMonthDocuments() {
  const [state, setState] = useState<MonthDocumentsState>({ status: "loading" });
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    let next: MonthDocumentsState;
    try {
      const response = await apiFetch("/api/documents");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data: { documents: ExpenseDocument[] } = await response.json();
      next = { status: "ok", documents: data.documents };
    } catch {
      next = { status: "error" };
    }
    // Only the newest request may update the screen.
    if (request === latestRequest.current) {
      setState(next);
    }
  }, []);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    return load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { state, retry };
}
