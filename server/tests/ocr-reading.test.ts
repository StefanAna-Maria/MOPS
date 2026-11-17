import { describe, expect, it } from "vitest";
import { OcrError } from "../src/lib/ocr-client.js";
import { extractJson, parseOcrAnswer } from "../src/lib/ocr-reading.js";

const TODAY = "2026-11-15";

function field(value: unknown, confidence = 0.95) {
  return { value, confidence };
}

/** The answer the model gave for the real Carrefour Express receipt (2026-11-15), with the discount. */
function carrefour(overrides: Record<string, unknown> = {}) {
  return {
    merchant: field("Carrefour express"),
    date: field("2026-11-12"),
    time: field("17:58"),
    total: field(26.17),
    paymentMethod: field("CARD"),
    items: [
      { name: field("PARTY MIX MIXED 60G"), quantity: field(2), amount: field(12.38), category: field("GROCERIES") },
      { name: field("GOURMET GOLD MOUSSE"), quantity: field(1), amount: field(4.05), category: field("GROCERIES") },
      { name: field("PORUMB150G CRF CLASS"), quantity: field(1), amount: field(4.35), category: field("GROCERIES") },
      { name: field("OREZ B.LUNG PILAF"), quantity: field(1), amount: field(8.59), category: field("GROCERIES") },
      { name: field("DISCOUNT"), quantity: field(1), amount: field(-3.2), category: field("GROCERIES") },
    ],
    ...overrides,
  };
}

function parse(answer: unknown) {
  return parseOcrAnswer(JSON.stringify(answer), TODAY);
}

describe("parseOcrAnswer", () => {
  it("CA-09.2: returns merchant, date, time, total, payment and products, each with a confidence", () => {
    const reading = parse(carrefour());

    expect(reading.merchant).toEqual({ value: "Carrefour express", confidence: 0.95 });
    expect(reading.date).toEqual({ value: "2026-11-12", confidence: 0.95 });
    expect(reading.time).toEqual({ value: "17:58", confidence: 0.95 });
    expect(reading.total).toEqual({ value: "26.17", confidence: 0.95 });
    expect(reading.paymentMethod).toEqual({ value: "CARD", confidence: 0.95 });
    expect(reading.items).toHaveLength(5);
    expect(reading.items[0]).toEqual({
      name: { value: "PARTY MIX MIXED 60G", confidence: 0.95 },
      quantity: { value: 2, confidence: 0.95 },
      amount: { value: "12.38", confidence: 0.95 },
      category: { value: "GROCERIES", confidence: 0.95 },
    });
    expect(reading.items[4].amount.value).toBe("-3.20");
    expect(reading.itemsTotal).toBe("26.17");
    expect(reading.totalMatches).toBe(true);
  });

  it("lowers the confidence of the total and the amounts when the products do not add up (a dropped discount)", () => {
    const withoutDiscount = carrefour();
    withoutDiscount.items = withoutDiscount.items.slice(0, 4);

    const reading = parse(withoutDiscount);

    expect(reading.totalMatches).toBe(false);
    expect(reading.itemsTotal).toBe("29.37");
    expect(reading.total.confidence).toBeLessThan(0.8);
    expect(reading.items.every((item) => item.amount.confidence < 0.8)).toBe(true);
    // The other values keep the model's confidence.
    expect(reading.merchant.confidence).toBe(0.95);
  });

  it("lowers the confidence of a date in the future (day and month read the other way round)", () => {
    const reading = parse(carrefour({ date: field("2026-12-11") }));

    expect(reading.date.value).toBe("2026-12-11");
    expect(reading.date.confidence).toBeLessThan(0.8);
  });

  it("keeps the confidence between 0 and 1 and guesses 0.5 when the model gives none", () => {
    const reading = parse(carrefour({ merchant: field("Mega Image", 7), time: "18:42" }));

    expect(reading.merchant.confidence).toBe(1);
    expect(reading.time).toEqual({ value: "18:42", confidence: 0.5 });
  });

  it.each([
    ["17-58-41", "17:58"],
    ["9:05", "09:05"],
    ["18.42", "18:42"],
  ])("normalizes the time %s to %s", (raw, time) => {
    expect(parse(carrefour({ time: field(raw) })).time.value).toBe(time);
  });

  it.each([["25:00"], ["tomorrow"], [null]])("drops an invalid time %s", (raw) => {
    expect(parse(carrefour({ time: field(raw) })).time).toEqual({ value: null, confidence: 0 });
  });

  it("accepts amounts written as text with a comma or lei", () => {
    const reading = parse(carrefour({ total: field("26,17 lei") }));

    expect(reading.total.value).toBe("26.17");
    expect(reading.totalMatches).toBe(true);
  });

  it("marks an unknown payment as not found and an unknown category as Altele with low confidence", () => {
    const answer = carrefour({ paymentMethod: field("VOUCHER") });
    answer.items[0].category = field("SNACKS");

    const reading = parse(answer);

    expect(reading.paymentMethod).toEqual({ value: null, confidence: 0 });
    expect(reading.items[0].category).toEqual({ value: "OTHER", confidence: 0.4 });
  });

  it("accepts lowercase payment and category codes", () => {
    const answer = carrefour({ paymentMethod: field("card") });
    answer.items[0].category = field("groceries");

    const reading = parse(answer);

    expect(reading.paymentMethod.value).toBe("CARD");
    expect(reading.items[0].category.value).toBe("GROCERIES");
  });

  it("drops products without a name and uses quantity 1 when it is missing", () => {
    const answer = carrefour();
    answer.items.push({ name: field(""), quantity: field(1), amount: field(1), category: field("OTHER") });
    answer.items[1].quantity = field(null);

    const reading = parse(answer);

    expect(reading.items).toHaveLength(5);
    expect(reading.items[1].quantity).toEqual({ value: 1, confidence: 0.5 });
  });

  it("treats a missing total as not found and not matching", () => {
    const reading = parse(carrefour({ total: field(null) }));

    expect(reading.total).toEqual({ value: null, confidence: 0 });
    expect(reading.totalMatches).toBe(false);
  });

  it("throws UNREADABLE when nothing was read (not a receipt)", () => {
    const empty = {
      merchant: field(null, 0),
      date: field(null, 0),
      time: field(null, 0),
      total: field(null, 0),
      paymentMethod: field(null, 0),
      items: [],
    };

    expect(() => parse(empty)).toThrow(OcrError);
    try {
      parse(empty);
    } catch (error) {
      expect((error as OcrError).code).toBe("UNREADABLE");
    }
  });
});

describe("extractJson", () => {
  it("reads JSON wrapped in ```json fences or surrounded by text", () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Iată rezultatul: {"a": 1} Sper că ajută.')).toEqual({ a: 1 });
  });

  it.each([["no json here"], ["{not: valid"]])("throws UNREADABLE for %s", (raw) => {
    expect(() => extractJson(raw)).toThrow(OcrError);
  });
});
