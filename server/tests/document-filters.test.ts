import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { createSignedInUser, get, resetDatabase, send } from "./helpers.js";

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
}

async function addDocument(email: string, type: string, merchant: string, extra: Record<string, unknown> = {}) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.document.create({
    data: {
      userId: user.id,
      type,
      merchant,
      date: new Date(`${todayIso()}T00:00:00.000Z`),
      total: "10.00",
      category: "OTHER",
      paymentMethod: "CARD",
      clientRequestId: randomUUID(),
      lines: { create: [{ position: 1, name: merchant, amount: "10.00", category: "OTHER" }] },
      ...extra,
    },
  });
}

async function merchants(cookie: string, query: string) {
  const response = await get(`/api/documents?${query}`, { cookie });
  const body = await response.json();
  return { status: response.status, merchants: (body.documents ?? []).map((d: { merchant: string }) => d.merchant) };
}

async function userWithOneOfEach() {
  const { email, cookie } = await createSignedInUser();
  await addDocument(email, "SCANNED", "Mega Image");
  await addDocument(email, "SCANNED_INVOICE", "eMAG");
  await addDocument(email, "MANUAL", "Piața Obor");
  return { email, cookie };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("GET /api/documents?type=…", () => {
  it("CA-15.1: without a filter, or with Toate, returns every kind of document", async () => {
    const { cookie } = await userWithOneOfEach();

    const none = await merchants(cookie, "context=personal");
    const all = await merchants(cookie, "context=personal&type=ALL");

    expect([...none.merchants].sort()).toEqual(["Mega Image", "Piața Obor", "eMAG"]);
    expect(all.merchants).toEqual(none.merchants);
  });

  it.each([
    ["RECEIPTS", ["Mega Image"]],
    ["INVOICES", ["eMAG"]],
    ["MANUAL", ["Piața Obor"]],
  ])("CA-15.1: %s returns only that kind of document", async (type, expected) => {
    const { cookie } = await userWithOneOfEach();

    expect((await merchants(cookie, `context=personal&type=${type}`)).merchants).toEqual(expected);
  });

  it("CA-15.2: the number of documents follows the filter", async () => {
    const { email, cookie } = await userWithOneOfEach();
    await addDocument(email, "SCANNED", "Lidl");

    expect((await merchants(cookie, "context=personal")).merchants).toHaveLength(4);
    expect((await merchants(cookie, "context=personal&type=RECEIPTS")).merchants).toHaveLength(2);
  });

  it("refuses an unknown filter", async () => {
    const { cookie } = await createSignedInUser();

    const response = await get("/api/documents?context=personal&type=CHITANTE", { cookie });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_FILTER" });
  });

  it("the filter keeps the personal and company lists separate", async () => {
    const { email, cookie } = await userWithOneOfEach();
    const { company } = await (
      await send("POST", "/api/company", { cui: "RO 14399840", name: "Exemplu SRL", address: "Str. 1" }, { cookie })
    ).json();
    await addDocument(email, "SCANNED_INVOICE", "Factura firmei", { companyId: company.id });

    expect((await merchants(cookie, "context=personal&type=INVOICES")).merchants).toEqual(["eMAG"]);
    expect((await merchants(cookie, "context=company&type=INVOICES")).merchants).toEqual(["Factura firmei"]);
  });
});
