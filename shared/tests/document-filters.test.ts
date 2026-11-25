import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCUMENT_FILTER,
  DOCUMENT_FILTERS,
  DOCUMENT_FILTER_LABELS,
  DOCUMENT_FILTER_TYPES,
  DOCUMENT_TYPES,
  formatRecordCount,
  isDocumentFilter,
} from "../src/expense.js";

describe("document filters", () => {
  it("CA-15.1: offers Toate, Bonuri, Facturi and Manuale, with Toate by default", () => {
    expect(DOCUMENT_FILTERS.map((filter) => DOCUMENT_FILTER_LABELS[filter])).toEqual([
      "Toate",
      "Bonuri",
      "Facturi",
      "Manuale",
    ]);
    expect(DEFAULT_DOCUMENT_FILTER).toBe("ALL");
  });

  it("CA-15.1: each filter shows its own document type, and every type has a filter", () => {
    expect(DOCUMENT_FILTER_TYPES).toEqual({
      ALL: null,
      RECEIPTS: ["SCANNED"],
      INVOICES: ["SCANNED_INVOICE"],
      MANUAL: ["MANUAL"],
    });
    const filtered = DOCUMENT_FILTERS.flatMap((filter) => DOCUMENT_FILTER_TYPES[filter] ?? []);
    expect([...filtered].sort()).toEqual([...DOCUMENT_TYPES].sort());
  });

  it("recognises only the known filters", () => {
    expect(isDocumentFilter("INVOICES")).toBe(true);
    expect(isDocumentFilter("RECEIPTS_AND_MORE")).toBe(false);
    expect(isDocumentFilter(undefined)).toBe(false);
  });
});

describe("formatRecordCount", () => {
  it.each([
    [0, "0 înregistrări"],
    [1, "1 înregistrare"],
    [2, "2 înregistrări"],
    [19, "19 înregistrări"],
    [20, "20 de înregistrări"],
    [21, "21 de înregistrări"],
    [100, "100 de înregistrări"],
    [101, "101 înregistrări"],
    [120, "120 de înregistrări"],
  ])("CA-15.2: %i → %s", (count, expected) => {
    expect(formatRecordCount(count)).toBe(expected);
  });
});
