import { describe, expect, it } from "vitest";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  formatDisplayDate,
  isPaymentDateValid,
  isValidTimeZone,
  monthBounds,
  parseAmount,
  parseDisplayDate,
  timeInTimeZone,
  todayInTimeZone,
  validateManualExpense,
} from "../src/expense.js";

describe("parseAmount", () => {
  it.each([
    ["12,5", "12.50"],
    ["12.50", "12.50"],
    ["12", "12.00"],
    [" 0,01 ", "0.01"],
    ["007,5", "7.50"],
    ["9999999.99", "9999999.99"],
  ])("CA-03.3: accepts %s as %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(["0", "0,00", "-5", "12,345", "12.", ",5", "abc", "", "1 000", "10000000", "1e3"])(
    "CA-03.3: rejects %s",
    (input) => {
      expect(parseAmount(input)).toBeNull();
    },
  );
});

describe("dates", () => {
  it("parses ZZ.LL.AAAA into an ISO date", () => {
    expect(parseDisplayDate("14.11.2026")).toBe("2026-11-14");
    expect(parseDisplayDate("1.2.2026")).toBe("2026-02-01");
  });

  it.each(["31.02.2026", "2026-11-14", "14/11/2026", "14.13.2026", "", "14.11.26"])("rejects %s", (input) => {
    expect(parseDisplayDate(input)).toBeNull();
  });

  it("formats an ISO date as ZZ.LL.AAAA", () => {
    expect(formatDisplayDate("2026-03-05")).toBe("05.03.2026");
  });

  it("CA-03.4: accepts today and past dates, rejects future dates", () => {
    expect(isPaymentDateValid("2026-11-14", "2026-11-14")).toBe(true);
    expect(isPaymentDateValid("2025-01-01", "2026-11-14")).toBe(true);
    expect(isPaymentDateValid("2026-11-15", "2026-11-14")).toBe(false);
    expect(isPaymentDateValid(null, "2026-11-14")).toBe(false);
  });

  it("computes today in the user's time zone", () => {
    const lateEveningUtc = new Date("2026-11-14T23:30:00Z");
    expect(todayInTimeZone("UTC", lateEveningUtc)).toBe("2026-11-14");
    expect(todayInTimeZone("Europe/Bucharest", lateEveningUtc)).toBe("2026-11-15");
  });

  it("validates time zone names", () => {
    expect(isValidTimeZone("Europe/Bucharest")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });
});

describe("categories", () => {
  it("has 9 categories, each with a label, including Altele", () => {
    expect(EXPENSE_CATEGORIES).toHaveLength(9);
    for (const category of EXPENSE_CATEGORIES) {
      expect(EXPENSE_CATEGORY_LABELS[category]).toBeTruthy();
    }
    expect(EXPENSE_CATEGORY_LABELS.OTHER).toBe("Altele");
  });
});

describe("validateManualExpense", () => {
  const today = "2026-11-14";
  const valid = { description: " Piață ", amount: "12,5", date: "2026-11-14" };

  it("applies defaults: category Altele, payment Numerar, no note", () => {
    expect(validateManualExpense(valid, today)).toEqual({
      ok: true,
      value: {
        description: "Piață",
        amount: "12.50",
        date: "2026-11-14",
        category: "OTHER",
        paymentMethod: "CASH",
        note: null,
      },
    });
  });

  it("keeps a chosen category, payment method and note", () => {
    const result = validateManualExpense(
      { ...valid, category: "GROCERIES", paymentMethod: "CARD", note: " legume " },
      today,
    );
    expect(result.ok && result.value).toMatchObject({ category: "GROCERIES", paymentMethod: "CARD", note: "legume" });
  });

  it("reports every invalid field", () => {
    const result = validateManualExpense(
      {
        description: "  ",
        amount: "12,345",
        date: "2026-11-15",
        category: "FOOD",
        paymentMethod: "CRYPTO",
        note: "x".repeat(501),
      },
      today,
    );
    expect(result).toEqual({
      ok: false,
      fields: ["description", "amount", "date", "category", "paymentMethod", "note"],
    });
  });

  it("rejects a description longer than 120 characters", () => {
    expect(validateManualExpense({ ...valid, description: "a".repeat(121) }, today).ok).toBe(false);
    expect(validateManualExpense({ ...valid, description: "a".repeat(120) }, today).ok).toBe(true);
  });

  it("rejects a body that is not an object, or values of the wrong type", () => {
    expect(validateManualExpense(null, today).ok).toBe(false);
    expect(validateManualExpense({ ...valid, amount: 12.5 }, today).ok).toBe(false);
  });
});

describe("monthBounds", () => {
  it("CA-04.5: returns the first day of the month and of the next month", () => {
    expect(monthBounds("2026-11-14")).toEqual({ start: "2026-11-01", end: "2026-12-01" });
    expect(monthBounds("2026-12-31")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
    expect(monthBounds("2026-01-01")).toEqual({ start: "2026-01-01", end: "2026-02-01" });
  });
});

describe("timeInTimeZone", () => {
  it("gives the current time in the phone's time zone, 24h", () => {
    const now = new Date("2026-11-21T12:05:00Z");
    expect(timeInTimeZone("Europe/Bucharest", now)).toBe("14:05");
    expect(timeInTimeZone("UTC", new Date("2026-11-21T00:07:00Z"))).toBe("00:07");
  });
});
