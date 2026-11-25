import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { createSignedInUser, get, resetDatabase, send } from "./helpers.js";

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** What the edit screen sends: every field of the form. */
function edit(extra: Record<string, unknown> = {}) {
  return {
    merchant: "Piața Obor",
    amount: "25,40",
    date: todayIso(),
    category: "GROCERIES",
    paymentMethod: "CARD",
    note: "legume",
    ...extra,
  };
}

function patch(id: string, body: unknown, cookie?: string) {
  return send("PATCH", `/api/documents/${id}`, body, { cookie });
}

async function addExpense(cookie: string, extra: Record<string, unknown> = {}) {
  const response = await send(
    "POST",
    "/api/documents/manual",
    { clientRequestId: randomUUID(), description: "Greșit", amount: "10", date: todayIso(), ...extra },
    { cookie },
  );
  return (await response.json()).document as { id: string };
}

/** A scanned receipt with two products, saved the way US-11 saves it. */
async function addScannedReceipt(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const fileId = randomUUID().replace(/-/g, "");
  await prisma.file.create({
    data: {
      id: fileId,
      userId: user.id,
      originalName: "receipt.jpg",
      mimeType: "image/jpeg",
      size: 12,
      storageKey: `${user.id}/${fileId}.jpg`,
      ocrResult: { create: { status: "DONE" } },
    },
  });
  const document = await prisma.document.create({
    data: {
      userId: user.id,
      type: "SCANNED",
      merchant: "Carrefour",
      date: new Date(`${todayIso()}T00:00:00.000Z`),
      time: "17:58",
      total: "30.00",
      category: "GROCERIES",
      paymentMethod: "CARD",
      clientRequestId: `scan-${fileId}`,
      fileId,
      lines: {
        create: [
          { position: 1, name: "Pâine", amount: "10.00", category: "GROCERIES" },
          { position: 2, name: "Lapte", amount: "20.00", category: "GROCERIES" },
        ],
      },
    },
  });
  return { id: document.id, fileId };
}

async function savedDocument(id: string) {
  return prisma.document.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } });
}

beforeEach(async () => {
  await resetDatabase();
});

describe("PATCH /api/documents/:id", () => {
  it("returns 401 without a session", async () => {
    expect((await patch("abc", edit())).status).toBe(401);
  });

  it("CA-13.1: changes the merchant, date, amount, category, payment and note of a manual expense", async () => {
    const { cookie } = await createSignedInUser();
    const { id } = await addExpense(cookie);
    const yesterday = addDays(todayIso(), -1);

    const response = await patch(
      id,
      edit({ merchant: "Piața Obor, taraba 4", amount: "25,40", date: yesterday, category: "HEALTH", paymentMethod: "TRANSFER", note: "corectat" }),
      cookie,
    );

    expect(response.status).toBe(200);
    const { document } = await response.json();
    expect(document).toMatchObject({
      id,
      type: "MANUAL",
      merchant: "Piața Obor, taraba 4",
      date: yesterday,
      total: "25.40",
      category: "HEALTH",
      categoryName: "Sănătate",
      paymentMethod: "TRANSFER",
      note: "corectat",
    });
    const saved = await savedDocument(id);
    expect(saved).toMatchObject({ merchant: "Piața Obor, taraba 4", category: "HEALTH", paymentMethod: "TRANSFER", note: "corectat" });
    expect(saved.total.toFixed(2)).toBe("25.40");
    expect(saved.date.toISOString().slice(0, 10)).toBe(yesterday);
  });

  it("CA-13.1: the single product of a manual expense follows the edit", async () => {
    const { cookie } = await createSignedInUser();
    const { id } = await addExpense(cookie);

    await patch(id, edit({ merchant: "Farmacia Tei", amount: "99,99", category: "HEALTH" }), cookie);

    const { lines } = await savedDocument(id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ name: "Farmacia Tei", category: "HEALTH" });
    expect(lines[0].amount.toFixed(2)).toBe("99.99");
  });

  it("CA-13.1: a scanned document changes its own values, and keeps its products, time, type and photo", async () => {
    const { cookie, email } = await createSignedInUser();
    const { id, fileId } = await addScannedReceipt(email);

    const response = await patch(
      id,
      edit({ merchant: "Carrefour Express", amount: "31,50", category: "SHOPPING", paymentMethod: "CASH", note: "fără pungă" }),
      cookie,
    );

    expect(response.status).toBe(200);
    const saved = await savedDocument(id);
    expect(saved).toMatchObject({
      type: "SCANNED",
      merchant: "Carrefour Express",
      time: "17:58",
      category: "SHOPPING",
      paymentMethod: "CASH",
      note: "fără pungă",
      fileId,
    });
    expect(saved.total.toFixed(2)).toBe("31.50");
    expect(saved.lines.map((line) => [line.name, line.amount.toFixed(2), line.category])).toEqual([
      ["Pâine", "10.00", "GROCERIES"],
      ["Lapte", "20.00", "GROCERIES"],
    ]);
  });

  it("CA-13.1: the profile of the document does not change", async () => {
    const { cookie } = await createSignedInUser();
    await send("POST", "/api/company", { cui: "RO 14399840", name: "Exemplu SRL", address: "Str. 1" }, { cookie });
    const response = await send(
      "POST",
      "/api/documents/manual",
      { clientRequestId: randomUUID(), description: "Birou", amount: "50", date: todayIso(), context: "company" },
      { cookie },
    );
    const { id } = (await response.json()).document;

    const { document } = await (await patch(id, edit(), cookie)).json();

    expect(document.context).toBe("company");
  });

  it("CA-13.1: an empty note removes the note, and the note may be left out", async () => {
    const { cookie } = await createSignedInUser();
    const { id } = await addExpense(cookie, { note: "veche" });

    await patch(id, edit({ note: "   " }), cookie);
    expect((await savedDocument(id)).note).toBeNull();

    await patch(id, edit({ note: "nouă" }), cookie);
    expect((await savedDocument(id)).note).toBe("nouă");

    const { note: _removed, ...withoutNote } = edit();
    await patch(id, withoutNote, cookie);
    expect((await savedDocument(id)).note).toBeNull();
  });

  it("CA-13.1: accepts a category I created", async () => {
    const { cookie } = await createSignedInUser();
    const { category } = await (await send("POST", "/api/categories", { name: "Sală de sport" }, { cookie })).json();
    const { id } = await addExpense(cookie);

    const response = await patch(id, edit({ category: category.id }), cookie);

    expect(response.status).toBe(200);
    expect((await response.json()).document).toMatchObject({ category: category.id, categoryName: "Sală de sport" });
  });

  it("CA-13.1: refuses a category that belongs to another user", async () => {
    const other = await createSignedInUser();
    const { category } = await (await send("POST", "/api/categories", { name: "Secret" }, { cookie: other.cookie })).json();
    const { cookie } = await createSignedInUser();
    const { id } = await addExpense(cookie);

    const response = await patch(id, edit({ category: category.id }), cookie);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_EXPENSE", fields: ["category"] });
    expect((await savedDocument(id)).category).toBe("OTHER");
  });

  it.each([
    ["an empty merchant", { merchant: "   " }, ["merchant"]],
    ["a merchant over 120 characters", { merchant: "a".repeat(121) }, ["merchant"]],
    ["a zero amount", { amount: "0" }, ["amount"]],
    ["a negative amount", { amount: "-5" }, ["amount"]],
    ["an amount that is not a number", { amount: "douăzeci" }, ["amount"]],
    ["an amount with three decimals", { amount: "12,345" }, ["amount"]],
    ["an amount that is too large", { amount: "10000000" }, ["amount"]],
    ["an invalid date", { date: "2026-02-30" }, ["date"]],
    ["a date that is not a date", { date: "ieri" }, ["date"]],
    ["a future date", { date: addDays(todayIso(), 1) }, ["date"]],
    ["an unknown category", { category: "SPAȚIU" }, ["category"]],
    ["an unknown payment method", { paymentMethod: "BITCOIN" }, ["paymentMethod"]],
    ["a note over 500 characters", { note: "n".repeat(501) }, ["note"]],
    ["several wrong fields", { merchant: "", amount: "0", date: addDays(todayIso(), 5) }, ["merchant", "amount", "date"]],
  ])("CA-13.1: refuses %s, like when an expense is added, and nothing changes", async (_case, wrong, fields) => {
    const { cookie } = await createSignedInUser();
    const { id } = await addExpense(cookie, { description: "Original", amount: "10", note: "a" });

    const response = await patch(id, edit(wrong), cookie);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_EXPENSE", fields });
    const saved = await savedDocument(id);
    expect(saved).toMatchObject({ merchant: "Original", note: "a", category: "OTHER", paymentMethod: "CASH" });
    expect(saved.total.toFixed(2)).toBe("10.00");
    expect(saved.lines[0]).toMatchObject({ name: "Original" });
  });

  it("CA-13.1: a date is checked against today in the phone's time zone, like when an expense is added", async () => {
    const { cookie } = await createSignedInUser();
    const { id } = await addExpense(cookie);
    const tomorrow = addDays(todayIso(), 1);

    const refused = await send("PATCH", `/api/documents/${id}`, edit({ date: tomorrow }), {
      cookie,
    });

    expect(refused.status).toBe(400);
  });

  it.each([
    ["merchant"],
    ["amount"],
    ["date"],
    ["category"],
    ["paymentMethod"],
  ])("refuses an edit without %s instead of resetting it", async (field) => {
    const { cookie } = await createSignedInUser();
    const { id } = await addExpense(cookie, { category: "HEALTH", paymentMethod: "CARD" });
    const body: Record<string, unknown> = edit();
    delete body[field];

    const response = await patch(id, body, cookie);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_EXPENSE", fields: [field] });
    expect(await savedDocument(id)).toMatchObject({ category: "HEALTH", paymentMethod: "CARD" });
  });

  it("refuses a body that is not JSON", async () => {
    const { cookie } = await createSignedInUser();
    const { id } = await addExpense(cookie);

    const response = await patch(id, "not an object", cookie);

    expect(response.status).toBe(400);
  });

  it("CA-13.2: the list shows the corrected values", async () => {
    const { cookie } = await createSignedInUser();
    const { id } = await addExpense(cookie, { description: "Greșit", amount: "10" });
    await addExpense(cookie, { description: "Alta", amount: "5" });

    await patch(id, edit({ merchant: "Corect", amount: "42,10" }), cookie);

    const { documents } = await (await get("/api/documents?context=personal", { cookie })).json();
    const byMerchant = Object.fromEntries(documents.map((doc: { merchant: string; total: string }) => [doc.merchant, doc.total]));
    expect(byMerchant).toEqual({ Corect: "42.10", Alta: "5.00" });
  });

  it("CA-13.2: the totals change by the difference, so the day total follows", async () => {
    const { cookie } = await createSignedInUser();
    const { id } = await addExpense(cookie, { amount: "10" });
    await addExpense(cookie, { amount: "5" });
    const dayTotal = async () => {
      const { documents } = await (await get("/api/documents?context=personal", { cookie })).json();
      return documents.reduce((sum: number, doc: { total: string }) => sum + Math.round(Number(doc.total) * 100), 0);
    };
    expect(await dayTotal()).toBe(1500);

    await patch(id, edit({ amount: "30" }), cookie);

    expect(await dayTotal()).toBe(3500);
  });

  it("CA-13.2: a document moved to a day of another month leaves this month's list", async () => {
    const { cookie } = await createSignedInUser();
    const { id } = await addExpense(cookie);
    const firstOfMonth = `${todayIso().slice(0, 8)}01`;
    const lastMonth = addDays(firstOfMonth, -1);

    await patch(id, edit({ date: lastMonth }), cookie);

    const { documents } = await (await get("/api/documents?context=personal", { cookie })).json();
    expect(documents).toEqual([]);
    expect((await (await get(`/api/documents/${id}`, { cookie })).json()).document.date).toBe(lastMonth);
  });

  it("CA-13.2: the document opened afterwards shows the corrected values", async () => {
    const { cookie } = await createSignedInUser();
    const { id } = await addExpense(cookie);

    await patch(id, edit({ merchant: "Corect", note: "ok" }), cookie);

    const { document } = await (await get(`/api/documents/${id}`, { cookie })).json();
    expect(document).toMatchObject({ merchant: "Corect", total: "25.40", note: "ok" });
  });

  it("another user's document gets 404 and stays as it was", async () => {
    const owner = await createSignedInUser();
    const { id } = await addExpense(owner.cookie, { description: "Al altcuiva" });
    const other = await createSignedInUser();

    const response = await patch(id, edit({ merchant: "Furat" }), other.cookie);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "DOCUMENT_NOT_FOUND" });
    expect((await savedDocument(id)).merchant).toBe("Al altcuiva");
  });

  it("returns 404 for a document that does not exist", async () => {
    const { cookie } = await createSignedInUser();

    const response = await patch("nu-exista", edit(), cookie);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "DOCUMENT_NOT_FOUND" });
  });
});
