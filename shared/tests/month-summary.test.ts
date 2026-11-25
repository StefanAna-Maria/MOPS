import { describe, expect, it } from "vitest";
import {
  amountToCents,
  centsToAmount,
  computeCategoryShares,
  formatVariationPercent,
  monthNameRo,
  monthVariationPercent,
  previousMonthBounds,
} from "../src/index.js";

describe("US-05 — helperi pentru totalul lunii și variație", () => {
  describe("previousMonthBounds", () => {
    it("returns the previous calendar month within the same year", () => {
      expect(previousMonthBounds("2026-11-14")).toEqual({ start: "2026-10-01", end: "2026-11-01" });
      expect(previousMonthBounds("2026-03-01")).toEqual({ start: "2026-02-01", end: "2026-03-01" });
    });

    it("rolls over from January to December of the previous year", () => {
      expect(previousMonthBounds("2026-01-15")).toEqual({ start: "2025-12-01", end: "2026-01-01" });
    });
  });

  describe("monthNameRo", () => {
    it.each([
      ["2026-01", "ianuarie"],
      ["2026-02", "februarie"],
      ["2026-03", "martie"],
      ["2026-04", "aprilie"],
      ["2026-05", "mai"],
      ["2026-06", "iunie"],
      ["2026-07", "iulie"],
      ["2026-08", "august"],
      ["2026-09", "septembrie"],
      ["2026-10", "octombrie"],
      ["2026-11", "noiembrie"],
      ["2026-12", "decembrie"],
    ])("maps %s to %s", (yearMonth, expected) => {
      expect(monthNameRo(yearMonth)).toBe(expected);
    });

    it("accepts a full ISO date too", () => {
      expect(monthNameRo("2026-11-25")).toBe("noiembrie");
    });
  });

  describe("CA-05.3 — aritmetică exactă la ban", () => {
    it("avoids floating-point drift on 0.10 + 0.20 and 19.99 + 0.01", () => {
      expect(centsToAmount(amountToCents("0.10") + amountToCents("0.20"))).toBe("0.30");
      expect(centsToAmount(amountToCents("19.99") + amountToCents("0.01"))).toBe("20.00");
      expect(centsToAmount(amountToCents("33.33") + amountToCents("33.33") + amountToCents("33.34"))).toBe("100.00");
    });

    it("handles zero and negative amounts", () => {
      expect(amountToCents("0.00")).toBe(0);
      expect(centsToAmount(0)).toBe("0.00");
      expect(amountToCents("-3.20")).toBe(-320);
      expect(centsToAmount(-320)).toBe("-3.20");
    });
  });

  describe("CA-05.2 — monthVariationPercent", () => {
    it("returns null when there is no previous month total or it is zero", () => {
      expect(monthVariationPercent(50000, null)).toBeNull();
      expect(monthVariationPercent(50000, 0)).toBeNull();
      expect(monthVariationPercent(0, 0)).toBeNull();
    });

    it("returns a positive percentage when spending increased", () => {
      expect(monthVariationPercent(12500, 10000)).toBe(25);
      expect(monthVariationPercent(20000, 10000)).toBe(100);
    });

    it("returns a negative percentage when spending decreased", () => {
      expect(monthVariationPercent(8800, 10000)).toBe(-12);
      expect(monthVariationPercent(0, 10000)).toBe(-100);
    });

    it("returns 0 when spending is identical to last month", () => {
      expect(monthVariationPercent(10000, 10000)).toBe(0);
    });

    it("preserves sign for tiny non-zero changes under 0.5%", () => {
      expect(monthVariationPercent(10020, 10000)).toBe(0.2);
      expect(monthVariationPercent(9980, 10000)).toBe(-0.2);
      expect(monthVariationPercent(10001, 100000)).toBe(-90);
      expect(monthVariationPercent(100001, 100000)).toBe(0.1);
    });
  });

  describe("formatVariationPercent", () => {
    it("formats positive, negative, zero and decimal variations in Romanian", () => {
      expect(formatVariationPercent(18)).toBe("+18%");
      expect(formatVariationPercent(-12)).toBe("-12%");
      expect(formatVariationPercent(0)).toBe("0%");
      expect(formatVariationPercent(0.2)).toBe("+0,2%");
      expect(formatVariationPercent(-0.4)).toBe("-0,4%");
    });
  });

  describe("CA-16.2 — computeCategoryShares", () => {
    it("returns empty array for no categories", () => {
      expect(computeCategoryShares([])).toEqual([]);
    });

    it("returns 100% for a single category", () => {
      expect(computeCategoryShares([1250])).toEqual([100]);
    });

    it("sums to exactly 100% for equal thirds and sevenths", () => {
      const thirds = computeCategoryShares([3333, 3333, 3334]);
      expect(thirds).toEqual([33, 33, 34]);
      expect(thirds.reduce((a, b) => a + b, 0)).toBe(100);

      const equalThirds = computeCategoryShares([1000, 1000, 1000]);
      expect(equalThirds).toEqual([34, 33, 33]);
      expect(equalThirds.reduce((a, b) => a + b, 0)).toBe(100);

      const sevenths = computeCategoryShares([100, 100, 100, 100, 100, 100, 100]);
      expect(sevenths.reduce((a, b) => a + b, 0)).toBe(100);
    });

    it("computes exact percentages for uneven categories summing to 100%", () => {
      const shares = computeCategoryShares([7000, 2000, 1000]);
      expect(shares).toEqual([70, 20, 10]);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    });
  });
});

