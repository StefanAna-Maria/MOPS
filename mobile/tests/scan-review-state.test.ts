import type { OcrReading } from "@ocrinvoice/shared";
import {
  canSave,
  confirmField,
  countToCheck,
  createReview,
  editField,
  newItem,
  reviewTotal,
  toDocumentBody,
} from "@/lib/scan-review";

const TODAY = "2026-11-19";

const reading: OcrReading = {
  merchant: { value: "Carrefour express", confidence: 0.98 },
  date: { value: "2026-11-12", confidence: 0.98 },
  time: { value: "17:58", confidence: 0.98 },
  total: { value: "26.17", confidence: 0.5 },
  paymentMethod: { value: "CARD", confidence: 0.98 },
  items: [
    {
      name: { value: "PARTY MIX 60G", confidence: 0.95 },
      quantity: { value: 2, confidence: 0.95 },
      amount: { value: "29.37", confidence: 0.95 },
      category: { value: "GROCERIES", confidence: 0.95 },
    },
    {
      name: { value: "DISCOUNT", confidence: 0.95 },
      quantity: { value: 1, confidence: 0.95 },
      amount: { value: "-3.20", confidence: 0.95 },
      category: { value: "GROCERIES", confidence: 0.95 },
    },
  ],
  itemsTotal: "26.17",
  totalMatches: true,
};

describe("createReview", () => {
  it("CA-11.1: marks the values under 0.8 and the missing ones to be checked", () => {
    const review = createReview({ ...reading, time: { value: null, confidence: 0 } });

    expect(review.merchant.status).toBe("ok");
    expect(review.total.status).toBe("verify");
    expect(review.time).toEqual({ value: "", status: "verify" });
    expect(countToCheck(review)).toBe(2);
  });

  it("shows the date as ZZ.LL.AAAA and the amounts with a comma", () => {
    const review = createReview(reading);

    expect(review.date.value).toBe("12.11.2026");
    expect(review.total.value).toBe("26,17");
    expect(review.items.map((item) => item.amount.value)).toEqual(["29,37", "-3,20"]);
  });

  it("suggests the document's category from the products", () => {
    expect(createReview(reading).category).toBe("GROCERIES");
  });
});

describe("checking a value", () => {
  it("CA-11.1: a corrected value is marked Corectat", () => {
    expect(editField({ value: "26,17", status: "verify" }, "26,18")).toEqual({ value: "26,18", status: "corrected" });
  });

  it("CA-11.1: a value confirmed as correct no longer needs checking", () => {
    const review = createReview(reading);

    const checked = { ...review, total: confirmField(review.total) };

    expect(checked.total).toEqual({ value: "26,17", status: "confirmed" });
    expect(countToCheck(checked)).toBe(0);
  });

  it("a new product has to be filled in before saving", () => {
    const review = createReview(reading);

    expect(countToCheck({ ...review, items: [...review.items, newItem()] })).toBe(3);
  });
});

describe("reviewTotal", () => {
  it("CA-11.2: adds up the products as they are now", () => {
    const review = createReview(reading);
    const withoutDiscount = { ...review, items: review.items.slice(0, 1) };

    expect(reviewTotal(review)).toMatchObject({ itemsTotal: "26.17", matches: true });
    expect(reviewTotal(withoutDiscount)).toMatchObject({ itemsTotal: "29.37", difference: "3.20", matches: false });
  });
});

describe("canSave", () => {
  it("CA-11.3: is blocked while a value still has to be checked", () => {
    expect(canSave(createReview(reading), TODAY)).toBe(false);
  });

  it("CA-11.3: is blocked while the products do not add up to the total", () => {
    const review = createReview(reading);
    const checked = { ...review, total: editField(review.total, "30,00") };

    expect(canSave(checked, TODAY)).toBe(false);
  });

  it("CA-11.3: is allowed once everything is checked and the total matches", () => {
    const review = createReview(reading);

    expect(canSave({ ...review, total: confirmField(review.total) }, TODAY)).toBe(true);
  });
});

describe("toDocumentBody", () => {
  it("sends the checked values the way the server expects them", () => {
    const review = createReview(reading);

    expect(toDocumentBody({ ...review, total: confirmField(review.total) })).toEqual({
      documentKind: "RECEIPT",
      merchant: "Carrefour express",
      date: "2026-11-12",
      time: "17:58",
      total: "26.17",
      paymentMethod: "CARD",
      category: "GROCERIES",
      items: [
        { name: "PARTY MIX 60G", amount: "29.37", category: "GROCERIES" },
        { name: "DISCOUNT", amount: "-3.20", category: "GROCERIES" },
      ],
    });
  });

  it("sends no time when the receipt has none", () => {
    const review = createReview({ ...reading, time: { value: null, confidence: 0 } });

    expect(toDocumentBody(review).time).toBeNull();
  });
});

describe("createReview — invoices (US-09)", () => {
  const field = <T,>(value: T, confidence = 0.95) => ({ value, confidence });
  const invoiceReading: OcrReading = {
    documentKind: "INVOICE",
    merchant: field("Birotica Expert SRL"),
    date: field("2026-11-10"),
    time: { value: null, confidence: 0 },
    total: field("424.18"),
    paymentMethod: field("TRANSFER" as const),
    items: [
      {
        name: field("Hârtie copiator A4"),
        quantity: field(3),
        unitPrice: field("50.00"),
        vatAmount: field("31.50"),
        amount: field("181.50"),
        category: field("SHOPPING" as const),
      },
    ],
    itemsTotal: "181.50",
    totalMatches: false,
  };

  it("keeps the unit price without VAT, the VAT and the quantity of each invoice line, and the line total with VAT", () => {
    const review = createReview(invoiceReading);

    expect(review.documentKind).toBe("INVOICE");
    expect(review.items[0].amount.value).toBe("181,50");
    expect(review.items[0].invoice).toEqual({ quantity: 3, unitPrice: "50.00", vatAmount: "31.50", toCheck: false });
  });

  it("treats readings made before invoices were supported as receipts, without invoice details", () => {
    const review = createReview(reading);

    expect(review.documentKind).toBe("RECEIPT");
    expect(review.items.every((item) => item.invoice === undefined)).toBe(true);
  });

  it("sends the invoice kind and each line's quantity, unit price without VAT and VAT when saving", () => {
    const body = toDocumentBody(createReview(invoiceReading));

    expect(body.documentKind).toBe("INVOICE");
    expect(body.items[0]).toEqual({
      name: "Hârtie copiator A4",
      amount: "181.50",
      category: "SHOPPING",
      quantity: 3,
      unitPrice: "50.00",
      vatAmount: "31.50",
    });
  });

  it("sends a receipt without invoice details", () => {
    const body = toDocumentBody(createReview(reading));

    expect(body.documentKind).toBe("RECEIPT");
    expect(body.items[0]).not.toHaveProperty("unitPrice");
  });
});
