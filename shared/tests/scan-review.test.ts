import { describe, expect, it } from "vitest";
import { checkTotal, parseLineAmount, suggestCategory, validateScannedDocument } from "../src/scan-review.js";

const TODAY = "2026-11-19";

function validDocument(extra: Record<string, unknown> = {}) {
  return {
    merchant: "Carrefour Express",
    date: "2026-11-12",
    time: "17:58",
    total: "26.17",
    paymentMethod: "CARD",
    category: "GROCERIES",
    items: [
      { name: "PARTY MIX 60G", amount: "29.37", category: "GROCERIES" },
      { name: "DISCOUNT", amount: "-3.20", category: "GROCERIES" },
    ],
    ...extra,
  };
}

describe("parseLineAmount", () => {
  it.each([
    ["12,5", "12.50"],
    ["12.50", "12.50"],
    ["-3,20", "-3.20"],
    [" -0.5 ", "-0.50"],
    ["007", "7.00"],
  ])("accepts %s as %s", (input, expected) => {
    expect(parseLineAmount(input)).toBe(expected);
  });

  it.each(["0", "-0,00", "12,345", "abc", "", "--3", "3-", "10000000"])("rejects %s", (input) => {
    expect(parseLineAmount(input)).toBeNull();
  });
});

describe("checkTotal", () => {
  it("CA-11.2: the products add up to the total, a discount included", () => {
    expect(checkTotal("26.17", ["29.37", "-3.20"])).toEqual({
      itemsTotal: "26.17",
      difference: "0.00",
      matches: true,
    });
  });

  it("CA-11.2: shows how far the products are from the total", () => {
    expect(checkTotal("107.01", ["100.00", "2.01"])).toEqual({
      itemsTotal: "102.01",
      difference: "5.00",
      matches: false,
    });
  });

  it("CA-11.2: the difference is positive when the products are more than the total", () => {
    expect(checkTotal("10.00", ["12.50"])).toMatchObject({ difference: "2.50", matches: false });
  });

  it("CA-11.3: does not match while the total or a product amount is missing", () => {
    expect(checkTotal(null, ["10.00"])).toMatchObject({ itemsTotal: "10.00", matches: false });
    expect(checkTotal("10.00", ["10.00", null])).toMatchObject({ itemsTotal: "10.00", matches: false });
  });

  it("CA-11.3: does not match without products", () => {
    expect(checkTotal("10.00", [])).toMatchObject({ itemsTotal: "0.00", matches: false });
  });
});

describe("suggestCategory", () => {
  it("takes the category where most was spent", () => {
    expect(
      suggestCategory([
        { amount: "5.00", category: "SHOPPING" },
        { amount: "20.00", category: "GROCERIES" },
        { amount: "8.00", category: "SHOPPING" },
      ]),
    ).toBe("GROCERIES");
  });

  it("counts a discount against its own category", () => {
    expect(
      suggestCategory([
        { amount: "20.00", category: "GROCERIES" },
        { amount: "-15.00", category: "GROCERIES" },
        { amount: "10.00", category: "HEALTH" },
      ]),
    ).toBe("HEALTH");
  });

  it("falls back to Altele without products or categories", () => {
    expect(suggestCategory([])).toBe("OTHER");
    expect(suggestCategory([{ amount: null, category: null }])).toBe("OTHER");
  });
});

describe("validateScannedDocument", () => {
  it("CA-11.3: accepts a checked document whose products add up to the total", () => {
    expect(validateScannedDocument(validDocument({ merchant: "  Carrefour Express " }), TODAY)).toEqual({
      ok: true,
      value: {
        merchant: "Carrefour Express",
        date: "2026-11-12",
        time: "17:58",
        total: "26.17",
        paymentMethod: "CARD",
        category: "GROCERIES",
        items: [
          { name: "PARTY MIX 60G", amount: "29.37", category: "GROCERIES" },
          { name: "DISCOUNT", amount: "-3.20", category: "GROCERIES" },
        ],
      },
    });
  });

  it("accepts a receipt without a time", () => {
    const result = validateScannedDocument(validDocument({ time: null }), TODAY);
    expect(result).toMatchObject({ ok: true, value: { time: null } });
  });

  it("CA-11.3: refuses a document whose products do not add up to the total", () => {
    expect(validateScannedDocument(validDocument({ total: "30.00" }), TODAY)).toEqual({
      ok: false,
      fields: ["itemsTotal"],
    });
  });

  it.each([
    ["merchant", { merchant: "  " }],
    ["date", { date: "2026-11-20" }],
    ["date", { date: "12.11.2026" }],
    ["time", { time: "25:00" }],
    ["total", { total: "0" }],
    ["paymentMethod", { paymentMethod: "CRYPTO" }],
    ["category", { category: "FOOD" }],
  ])("CA-11.3: refuses an invalid %s", (field, extra) => {
    const result = validateScannedDocument(validDocument(extra), TODAY);
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.fields).toContain(field);
  });

  it.each([
    ["no products", []],
    ["a product without a name", [{ name: "", amount: "26.17", category: "GROCERIES" }]],
    ["a product without an amount", [{ name: "PAINE", amount: "", category: "GROCERIES" }]],
    ["a product with an unknown category", [{ name: "PAINE", amount: "26.17", category: "BREAD" }]],
  ])("CA-11.3: refuses %s", (_case, items) => {
    const result = validateScannedDocument(validDocument({ items }), TODAY);
    expect(result.ok ? [] : result.fields).toContain("items");
  });

  it("refuses something that is not a document", () => {
    expect(validateScannedDocument(null, TODAY).ok).toBe(false);
  });
});
