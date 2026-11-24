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

  it("keeps a reported confidence between 0 and 1, and gives 0.9 to a plain value the model read", () => {
    const reading = parse(carrefour({ merchant: field("Mega Image", 7), time: "18:42" }));

    expect(reading.merchant.confidence).toBe(1);
    expect(reading.time).toEqual({ value: "18:42", confidence: 0.9 });
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

/** An invoice: unit price WITHOUT VAT, the line's VAT, and the line total WITH VAT (2026-11-21). */
function invoice(overrides: Record<string, unknown> = {}) {
  const line = (name: string, quantity: number, unitPrice: number, vatAmount: number, amount: number, category = "SHOPPING") => ({
    name: field(name),
    quantity: field(quantity),
    unitPrice: field(unitPrice),
    vatAmount: field(vatAmount),
    amount: field(amount),
    category: field(category),
  });
  return {
    documentKind: "INVOICE",
    merchant: field("Birotica Expert SRL"),
    date: field("2026-11-10"),
    time: field(null, 0),
    total: field(424.18),
    paymentMethod: field("TRANSFER"),
    items: [
      // 3 × 50.00 = 150.00 + 21% VAT 31.50 = 181.50
      line("Hârtie copiator A4", 3, 50, 31.5, 181.5),
      // 2 × 89.90 = 179.80 + 21% VAT 37.76 = 217.56
      line("Toner imprimantă", 2, 89.9, 37.76, 217.56),
      // 1 × 22.63 = 22.63 + 11% VAT 2.49 = 25.12
      line("Carte contabilitate", 1, 22.63, 2.49, 25.12, "EDUCATION"),
    ],
    ...overrides,
  };
}

describe("parseOcrAnswer — invoices", () => {
  it("reads an invoice: unit price without VAT, VAT and total with VAT for each line, and only the amount to pay", () => {
    const reading = parse(invoice());

    expect(reading.documentKind).toBe("INVOICE");
    expect(reading.merchant.value).toBe("Birotica Expert SRL");
    expect(reading.total).toEqual({ value: "424.18", confidence: 0.95 });
    expect(reading.paymentMethod.value).toBe("TRANSFER");
    expect(reading.time).toEqual({ value: null, confidence: 0 });
    expect(reading.items[1]).toEqual({
      name: { value: "Toner imprimantă", confidence: 0.95 },
      quantity: { value: 2, confidence: 0.95 },
      unitPrice: { value: "89.90", confidence: 0.95 },
      vatAmount: { value: "37.76", confidence: 0.95 },
      amount: { value: "217.56", confidence: 0.95 },
      category: { value: "SHOPPING", confidence: 0.95 },
    });
    expect(reading.itemsTotal).toBe("424.18");
    expect(reading.totalMatches).toBe(true);
  });

  it("lowers the confidence of a line whose unit price × quantity + VAT is not its total", () => {
    const answer = invoice();
    answer.items[0].vatAmount = field(13.5); // misread: 3 × 50.00 + 31.50 = 181.50 is on the invoice

    const reading = parse(answer);

    expect(reading.items[0].unitPrice?.confidence).toBeLessThan(0.8);
    expect(reading.items[0].vatAmount?.confidence).toBeLessThan(0.8);
    expect(reading.items[0].amount.confidence).toBeLessThan(0.8);
    // The other lines are consistent and keep the model's confidence.
    expect(reading.items[1].amount.confidence).toBe(0.95);
  });

  it("accepts a 1 ban difference from rounding unit price × quantity", () => {
    const answer = invoice();
    // 3 × 33.333 → 99.999 ≈ 100.00; + VAT 21.00 = 121.00 (the invoice rounds to the ban)
    answer.items = [
      { name: field("Servicii"), quantity: field(3), unitPrice: field(33.333), vatAmount: field(21), amount: field(121), category: field("OTHER") },
    ];
    answer.total = field(121);

    const reading = parse(answer);

    expect(reading.items[0].amount.confidence).toBe(0.95);
    expect(reading.totalMatches).toBe(true);
  });

  it("computes a line total the model left out from the unit price, quantity and VAT", () => {
    const answer = invoice();
    answer.items[2].amount = field(null);

    const reading = parse(answer);

    expect(reading.items[2].amount.value).toBe("25.12");
    expect(reading.totalMatches).toBe(true);
  });

  it("recognizes an invoice from its lines even when the model does not say INVOICE", () => {
    const reading = parse(invoice({ documentKind: undefined }));

    expect(reading.documentKind).toBe("INVOICE");
  });

  it("keeps receipts without unit price and VAT", () => {
    const reading = parse(carrefour());

    expect(reading.documentKind).toBe("RECEIPT");
    expect(reading.items[0]).not.toHaveProperty("unitPrice");
    expect(reading.items[0]).not.toHaveProperty("vatAmount");
  });

  it("does not take a subtotal as the total: the lines with VAT must add up to the amount to pay", () => {
    // 150.00 + 179.80 + 22.63 = 352.43 is the subtotal WITHOUT VAT, a common mistake.
    const reading = parse(invoice({ total: field(352.43) }));

    expect(reading.totalMatches).toBe(false);
    expect(reading.total.confidence).toBeLessThan(0.8);
  });
});

describe("parseOcrAnswer — invoice line totals without VAT", () => {
  it("adds the VAT when the model copied the value WITHOUT VAT as the line total (seen on a real reading)", () => {
    const answer = invoice();
    // What Qwen3-VL answered on 2026-11-21: the "Valoare (fără TVA)" column instead of the total with VAT.
    answer.items[0].amount = field(150);
    answer.items[1].amount = field(179.8);
    answer.items[2].amount = field(22.63);

    const reading = parse(answer);

    expect(reading.items.map((item) => item.amount.value)).toEqual(["181.50", "217.56", "25.12"]);
    expect(reading.items.every((item) => item.amount.confidence >= 0.8)).toBe(true);
    expect(reading.totalMatches).toBe(true);
    expect(reading.total.confidence).toBe(0.95);
  });
});

describe("parseOcrAnswer — compact answer (2026-11-24)", () => {
  // What the model now writes: plain values, each product as one row [name, quantity, line total, category, unit?, VAT?].
  const megaImage = {
    kind: "RECEIPT",
    merchant: "S.C. MEGA IMAGE S.R.L.",
    date: "2026-11-15",
    time: "13:31",
    total: 107.01,
    payment: "CARD",
    items: [
      ["LAPTE F LACTOZA 1L", 1, 8.29, "GROCERIES"],
      ["BR CHEDDAR 150G", 1, 9.99, "GROCERIES"],
      ["MEGA EMMEN 200G", 1, 13.49, "GROCERIES"],
      ["BR CHEDDAR 150G", 1, 9.99, "GROCERIES"],
      ["PARMEZAN RAS 100G", 1, 16.99, "GROCERIES"],
      ["ABSORB PANTYLINE32", 1, 10.69, "HEALTH"],
      ["ABS NORMALE 12B", 1, 32.69, "HEALTH"],
      ["15% REDUCERE", 1, -4.9, "HEALTH"],
      ["GROM CEAPA GALBENA", 0.066, 0.14, "GROCERIES"],
      ["STRUGURI ROZ MP", 0.566, 6.79, "GROCERIES"],
      ["MELCISORI 400G", 1, 2.85, "GROCERIES"],
    ],
  };

  it("reads a compact receipt: every value with 0.9 and the lines adding up to the total", () => {
    const reading = parse(megaImage);

    expect(reading.documentKind).toBe("RECEIPT");
    expect(reading.merchant).toEqual({ value: "S.C. MEGA IMAGE S.R.L.", confidence: 0.9 });
    expect(reading.paymentMethod).toEqual({ value: "CARD", confidence: 0.9 });
    expect(reading.total).toEqual({ value: "107.01", confidence: 0.9 });
    expect(reading.items).toHaveLength(11);
    expect(reading.items[8]).toEqual({
      name: { value: "GROM CEAPA GALBENA", confidence: 0.9 },
      quantity: { value: 0.066, confidence: 0.9 },
      amount: { value: "0.14", confidence: 0.9 },
      category: { value: "GROCERIES", confidence: 0.9 },
    });
    expect(reading.items[7].amount.value).toBe("-4.90");
    expect(reading.totalMatches).toBe(true);
  });

  it("reads a compact invoice: unit price without VAT and VAT from the end of each row", () => {
    const reading = parse({
      kind: "INVOICE",
      merchant: "VANESSE SARL",
      date: "2026-11-17",
      time: null,
      total: 184.2,
      payment: "CARD",
      items: [
        ["Incarcator 100W", 1, 199.2, "SHOPPING", 166, 33.2],
        ["Reducere voucher", 1, -15, "SHOPPING", null, 0],
      ],
    });

    expect(reading.documentKind).toBe("INVOICE");
    expect(reading.items[0]).toMatchObject({
      unitPrice: { value: "166.00", confidence: 0.9 },
      vatAmount: { value: "33.20", confidence: 0.9 },
      amount: { value: "199.20", confidence: 0.9 },
    });
    expect(reading.time).toEqual({ value: null, confidence: 0 });
    expect(reading.totalMatches).toBe(true);
  });

  it("still marks values to check when a compact answer does not add up", () => {
    const reading = parse({ ...megaImage, total: 111.91 }); // the subtotal before the discount

    expect(reading.totalMatches).toBe(false);
    expect(reading.total.confidence).toBeLessThan(0.8);
    expect(reading.items.every((item) => item.amount.confidence < 0.8)).toBe(true);
  });

  it("adds the VAT when a compact invoice row has the value without VAT as its total", () => {
    const reading = parse({
      kind: "INVOICE",
      merchant: "Birotica SRL",
      date: "2026-11-10",
      time: null,
      total: 181.5,
      payment: "TRANSFER",
      items: [["Hartie A4", 3, 150, "SHOPPING", 50, 31.5]],
    });

    expect(reading.items[0].amount).toEqual({ value: "181.50", confidence: 0.9 });
    expect(reading.totalMatches).toBe(true);
  });
});

describe("parseOcrAnswer — products written as bare rows", () => {
  it("reads a row whose quantity is missing by value type, not position (seen on a real reading)", () => {
    const reading = parse({
      kind: "RECEIPT",
      merchant: "Mega Image",
      date: "2026-11-15",
      time: "13:31",
      total: 3.39,
      payment: "CARD",
      items: [
        ["LAPTE 1L", 1, 8.29, "GROCERIES"],
        ["15% REDUCERE", -4.9, "GROCERIES"],
      ],
    });

    expect(reading.items[1]).toMatchObject({
      name: { value: "15% REDUCERE" },
      quantity: { value: 1 },
      amount: { value: "-4.90" },
      category: { value: "GROCERIES" },
    });
    expect(reading.totalMatches).toBe(true);
  });
});

describe("parseOcrAnswer — invoice rules from real compact readings (2026-11-24)", () => {
  it("sets the quantity to 1 when the line value equals one unit price (quantity taken from the product name)", () => {
    // Invoice_1: "5 Porturi –3 USB-C" in the name was read as quantity 3, and the value without VAT as the total.
    const reading = parse({
      kind: "INVOICE",
      merchant: "VANESSE SARL",
      date: "2026-11-17",
      time: null,
      total: 184.2,
      paymentMethod: "CARD",
      items: [
        { name: "Incarcator 100W, 5 Porturi –3 USB-C", quantity: 3, unitPrice: 166, vatAmount: 33.2, amount: 166, category: "SHOPPING" },
        { name: "Reducere voucher", quantity: 1, unitPrice: 15, vatAmount: 0, amount: -15, category: "SHOPPING" },
      ],
    });

    expect(reading.items[0].quantity.value).toBe(1);
    expect(reading.items[0].amount.value).toBe("199.20");
    expect(reading.totalMatches).toBe(true);
    expect(reading.total.confidence).toBe(0.9);
  });

  it("treats a unit price of 0 on a discount line as not given, instead of marking the line to check", () => {
    // Invoice_2: voucher lines came as unit price 0, VAT 0, total -27.22.
    const reading = parse({
      kind: "INVOICE",
      merchant: "ANIMAL. GR",
      date: "2026-11-11",
      time: null,
      total: 56.21,
      paymentMethod: "CARD",
      items: [
        { name: "Lighean inox", quantity: 1, unitPrice: 67.28, vatAmount: 16.15, amount: 83.43, category: "SHOPPING" },
        { name: "Reducere voucher", quantity: 1, unitPrice: 0, vatAmount: 0, amount: -27.22, category: "SHOPPING" },
      ],
    });

    expect(reading.items[1].unitPrice).toEqual({ value: null, confidence: 0 });
    expect(reading.items[1].amount).toEqual({ value: "-27.22", confidence: 0.9 });
    expect(reading.totalMatches).toBe(true);
  });

  it("keeps a real quantity above 1 when the line value is quantity × unit price", () => {
    const reading = parse({
      kind: "INVOICE",
      merchant: "Birotica SRL",
      date: "2026-11-10",
      time: null,
      total: 181.5,
      paymentMethod: "TRANSFER",
      items: [{ name: "Hartie A4", quantity: 3, unitPrice: 50, vatAmount: 31.5, amount: 150, category: "SHOPPING" }],
    });

    expect(reading.items[0].quantity.value).toBe(3);
    expect(reading.items[0].amount.value).toBe("181.50");
  });
});

describe("parseOcrAnswer — discount written with a positive unit price", () => {
  it("accepts a voucher whose unit price has no minus sign, and gives it the discount's sign", () => {
    // Invoice_1 (2026-11-24): {"unitPrice":15,"vatAmount":0,"amount":-15}.
    const reading = parse({
      kind: "INVOICE",
      merchant: "VANESSE SARL",
      date: "2026-11-17",
      time: null,
      total: 184.2,
      paymentMethod: "CARD",
      items: [
        { name: "Incarcator 100W", quantity: 1, unitPrice: 166, vatAmount: 33.2, amount: 199.2, category: "SHOPPING" },
        { name: "Reducere voucher", quantity: 1, unitPrice: 15, vatAmount: 0, amount: -15, category: "SHOPPING" },
      ],
    });

    expect(reading.items[1].unitPrice).toEqual({ value: "-15.00", confidence: 0.9 });
    expect(reading.items[1].amount.confidence).toBe(0.9);
    expect(reading.totalMatches).toBe(true);
  });
});

describe("parseOcrAnswer — the model's receipt/invoice answer wins", () => {
  it("keeps a receipt a receipt even when its lines have a unit price (seen on a real Mega Image receipt)", () => {
    const reading = parse({
      kind: "RECEIPT",
      merchant: "S.C. MEGA IMAGE S.R.L.",
      date: "2026-11-15",
      time: "13:31",
      total: 8.29,
      paymentMethod: "CARD",
      items: [{ name: "LAPTE 1L", quantity: 1, unitPrice: 8.29, vatAmount: null, amount: 8.29, category: "GROCERIES" }],
    });

    expect(reading.documentKind).toBe("RECEIPT");
    expect(reading.items[0]).not.toHaveProperty("unitPrice");
  });
});
