import type { ExpenseDocument } from "@ocrinvoice/shared";
import { amountToCents, dayLabel, documentSubtitle, formatLei, groupByDay } from "@/lib/expense-list";

function doc(id: string, date: string, total: string, extra: Partial<ExpenseDocument> = {}): ExpenseDocument {
  return {
    id,
    context: "personal",
    type: "MANUAL",
    merchant: `Magazin ${id}`,
    date,
    time: null,
    total,
    category: "GROCERIES",
    paymentMethod: "CASH",
    note: null,
    fileId: null,
    createdAt: `${date}T10:00:00.000Z`,
    lines: [],
    ...extra,
  };
}

describe("formatLei", () => {
  it.each([
    [8420, "84,20 lei"],
    [5, "0,05 lei"],
    [123450, "1.234,50 lei"],
    [123456789, "1.234.567,89 lei"],
  ])("CA-04.2: formats %i cents as %s", (cents, text) => {
    expect(formatLei(cents)).toBe(text);
  });

  it("converts server amounts to cents without floating point errors", () => {
    expect(amountToCents("0.10") + amountToCents("0.20")).toBe(30);
    expect(amountToCents("84.20")).toBe(8420);
    expect(amountToCents("12")).toBe(1200);
  });
});

describe("dayLabel", () => {
  const today = "2026-11-14";

  it("CA-04.1: uses ASTĂZI and IERI", () => {
    expect(dayLabel("2026-11-14", today)).toBe("ASTĂZI");
    expect(dayLabel("2026-11-13", today)).toBe("IERI");
  });

  it("CA-04.1: uses the weekday and date for older days", () => {
    expect(dayLabel("2026-10-23", today)).toBe("VINERI, 23 OCTOMBRIE");
    expect(dayLabel("2025-10-23", today)).toBe("JOI, 23 OCTOMBRIE");
    expect(dayLabel("2026-11-01", today)).toBe("DUMINICĂ, 1 NOIEMBRIE");
  });

  it("knows IERI across a month boundary", () => {
    expect(dayLabel("2026-11-30", "2026-12-01")).toBe("IERI");
  });
});

describe("documentSubtitle", () => {
  it("CA-04.3: shows the category and the type", () => {
    expect(documentSubtitle(doc("1", "2026-11-14", "1.00"))).toBe("Alimente · Cheltuială manuală");
  });

  it("falls back to Altele for an unknown category", () => {
    expect(documentSubtitle(doc("1", "2026-11-14", "1.00", { category: "X" }))).toBe("Altele · Cheltuială manuală");
  });
});

describe("groupByDay", () => {
  it("CA-04.1 / CA-04.2: groups by day in order and adds up each day", () => {
    const sections = groupByDay(
      [
        doc("a", "2026-11-14", "50.00"),
        doc("b", "2026-11-14", "34.20"),
        doc("c", "2026-11-13", "0.10"),
        doc("d", "2026-11-05", "0.20"),
        doc("e", "2026-11-05", "0.10"),
      ],
      "2026-11-14",
    );

    expect(sections.map((s) => [s.title, s.totalCents, s.data.map((d) => d.id)])).toEqual([
      ["ASTĂZI", 8420, ["a", "b"]],
      ["IERI", 10, ["c"]],
      ["JOI, 5 NOIEMBRIE", 30, ["d", "e"]],
    ]);
  });

  it("returns no sections for no documents", () => {
    expect(groupByDay([], "2026-11-14")).toEqual([]);
  });
});

describe("negative amounts (discounts read from receipts)", () => {
  it("converts and formats a discount correctly", () => {
    expect(amountToCents("-3.20")).toBe(-320);
    expect(amountToCents("-0.05")).toBe(-5);
    expect(formatLei(-320)).toBe("-3,20 lei");
    expect(formatLei(-123450)).toBe("-1.234,50 lei");
    expect(formatLei(amountToCents("29.37") + amountToCents("-3.20"))).toBe("26,17 lei");
  });
});
