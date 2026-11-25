import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { amountToCents, previousMonthBounds } from "@ocrinvoice/shared";
import { prisma } from "../src/lib/prisma.js";
import { createSignedInUser, get, resetDatabase, send } from "./helpers.js";

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
}

function previousMonthMidIso() {
  const { start } = previousMonthBounds(todayIso());
  return `${start.slice(0, 8)}15`;
}

function twoMonthsAgoMidIso() {
  const { start: prevStart } = previousMonthBounds(todayIso());
  const { start: twoAgoStart } = previousMonthBounds(prevStart);
  return `${twoAgoStart.slice(0, 8)}15`;
}

async function addDoc(
  email: string,
  opts: { total: string; date?: string; type?: string; category?: string; companyId?: string | null; merchant?: string },
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const merchant = opts.merchant ?? "Magazin";
  const category = opts.category ?? "GROCERIES";
  await prisma.document.create({
    data: {
      userId: user.id,
      companyId: opts.companyId ?? null,
      type: opts.type ?? "MANUAL",
      merchant,
      date: new Date(`${opts.date ?? todayIso()}T00:00:00.000Z`),
      total: opts.total,
      category,
      paymentMethod: "CARD",
      clientRequestId: randomUUID(),
      lines: { create: [{ position: 1, name: merchant, amount: opts.total, category }] },
    },
  });
}

beforeEach(async () => {
  await resetDatabase();
});

describe("US-05 — GET /api/documents summary (totalul lunii și variația)", () => {
  it("CA-05.1 / CA-05.3: computes the current month total accurately to the ban", async () => {
    const { email, cookie } = await createSignedInUser();
    await addDoc(email, { total: "0.10" });
    await addDoc(email, { total: "0.20" });
    await addDoc(email, { total: "19.99" });
    await addDoc(email, { total: "0.01" });
    // Two months ago must not be included in either current or previous month totals.
    await addDoc(email, { total: "500.00", date: twoMonthsAgoMidIso() });

    const response = await get("/api/documents?context=personal", { cookie });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary).toMatchObject({
      month: todayIso().slice(0, 7),
      total: "20.30",
      count: 4,
      previousTotal: null,
      variationPercent: null,
    });
  });

  it("CA-05.2: omits variation (null) when there are no expenses in the previous month", async () => {
    const { email, cookie } = await createSignedInUser();
    await addDoc(email, { total: "150.00" });

    const { summary } = await (await get("/api/documents?context=personal", { cookie })).json();

    expect(summary.total).toBe("150.00");
    expect(summary.previousTotal).toBeNull();
    expect(summary.variationPercent).toBeNull();
  });

  it("CA-05.2: returns positive variation when current month spending exceeds previous month", async () => {
    const { email, cookie } = await createSignedInUser();
    await addDoc(email, { total: "100.00", date: previousMonthMidIso() });
    await addDoc(email, { total: "125.00" });

    const { summary } = await (await get("/api/documents?context=personal", { cookie })).json();

    expect(summary.total).toBe("125.00");
    expect(summary.previousTotal).toBe("100.00");
    expect(summary.variationPercent).toBe(25);
    expect(summary.previousByCategory).toEqual([
      { category: "GROCERIES", categoryName: "Alimente", total: "100.00", percent: 100, count: 1 },
    ]);
  });

  it("CA-05.2: returns negative variation when current month spending is lower than previous month", async () => {
    const { email, cookie } = await createSignedInUser();
    await addDoc(email, { total: "200.00", date: previousMonthMidIso() });
    await addDoc(email, { total: "150.00" });

    const { summary } = await (await get("/api/documents?context=personal", { cookie })).json();

    expect(summary.total).toBe("150.00");
    expect(summary.previousTotal).toBe("200.00");
    expect(summary.variationPercent).toBe(-25);
  });

  it("CA-05.2: returns -100% when current month has no expenses yet but previous month did", async () => {
    const { email, cookie } = await createSignedInUser();
    await addDoc(email, { total: "85.50", date: previousMonthMidIso() });

    const { summary } = await (await get("/api/documents?context=personal", { cookie })).json();

    expect(summary.total).toBe("0.00");
    expect(summary.previousTotal).toBe("85.50");
    expect(summary.variationPercent).toBe(-100);
  });

  it("keeps the monthly summary across all document types even when ?type= filters the list", async () => {
    const { email, cookie } = await createSignedInUser();
    await addDoc(email, { total: "100.00", date: previousMonthMidIso(), type: "MANUAL" });
    await addDoc(email, { total: "60.00", type: "SCANNED" });
    await addDoc(email, { total: "90.00", type: "SCANNED_INVOICE" });

    const body = await (await get("/api/documents?context=personal&type=RECEIPTS", { cookie })).json();

    expect(body.documents).toHaveLength(1);
    expect(body.summary.total).toBe("150.00");
    expect(body.summary.count).toBe(2);
    expect(body.summary.previousTotal).toBe("100.00");
    expect(body.summary.variationPercent).toBe(50);
  });

  it("isolates personal and company summaries completely", async () => {
    const { email, cookie } = await createSignedInUser();
    const { company } = await (
      await send("POST", "/api/company", { cui: "RO 14399840", name: "Exemplu SRL", address: "Str. 1" }, { cookie })
    ).json();

    await addDoc(email, { total: "100.00", date: previousMonthMidIso() });
    await addDoc(email, { total: "200.00" });
    await addDoc(email, { total: "500.00", companyId: company.id });

    const personal = (await (await get("/api/documents?context=personal", { cookie })).json()).summary;
    const companySummary = (await (await get("/api/documents?context=company", { cookie })).json()).summary;

    expect(personal).toMatchObject({ total: "200.00", previousTotal: "100.00", variationPercent: 100 });
    expect(companySummary).toMatchObject({ total: "500.00", previousTotal: null, variationPercent: null });
  });

  it("groups current month spending by category (including custom categories) sorted descending", async () => {
    const { email, cookie } = await createSignedInUser();
    const { category: custom } = await (
      await send("POST", "/api/categories", { name: "Sală" }, { cookie })
    ).json();

    await addDoc(email, { total: "45.50", category: "GROCERIES" });
    await addDoc(email, { total: "54.50", category: "GROCERIES" });
    await addDoc(email, { total: "250.00", category: custom.id });
    await addDoc(email, { total: "30.00", category: "TRANSPORT" });

    const { summary } = await (await get("/api/documents?context=personal", { cookie })).json();

    expect(summary.total).toBe("380.00");
    expect(summary.byCategory).toEqual([
      { category: custom.id, categoryName: "Sală", total: "250.00", percent: 66, count: 1 },
      { category: "GROCERIES", categoryName: "Alimente", total: "100.00", percent: 26, count: 2 },
      { category: "TRANSPORT", categoryName: "Transport", total: "30.00", percent: 8, count: 1 },
    ]);
    const totalPercent = summary.byCategory.reduce((s: number, c: { percent: number }) => s + c.percent, 0);
    expect(totalPercent).toBe(100);
  });

  it("CA-16.1 / CA-16.2: attributes multi-category scanned receipts to each product line's category with exact totals and 100% shares", async () => {
    const { email, cookie } = await createSignedInUser();
    const { category: beauty } = await (
      await send("POST", "/api/categories", { name: "Beauty" }, { cookie })
    ).json();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });

    await prisma.document.create({
      data: {
        userId: user.id,
        type: "SCANNED",
        merchant: "DM",
        date: new Date(`${todayIso()}T00:00:00.000Z`),
        total: "100.00",
        category: "GROCERIES",
        paymentMethod: "CARD",
        clientRequestId: randomUUID(),
        lines: {
          create: [
            { position: 1, name: "Apă și gustări", amount: "70.00", category: "GROCERIES" },
            { position: 2, name: "Cremă față", amount: "30.00", category: beauty.id },
          ],
        },
      },
    });

    const { summary } = await (await get("/api/documents?context=personal", { cookie })).json();

    expect(summary.total).toBe("100.00");
    expect(summary.byCategory).toEqual([
      { category: "GROCERIES", categoryName: "Alimente", total: "70.00", percent: 70, count: 1 },
      { category: beauty.id, categoryName: "Beauty", total: "30.00", percent: 30, count: 1 },
    ]);
  });

  it("CA-16.2: percentages sum to 100% and category totals sum exactly to the month total even for equal thirds", async () => {
    const { email, cookie } = await createSignedInUser();
    await addDoc(email, { total: "33.33", category: "GROCERIES" });
    await addDoc(email, { total: "33.33", category: "TRANSPORT" });
    await addDoc(email, { total: "33.34", category: "HEALTH" });

    const { summary } = await (await get("/api/documents?context=personal", { cookie })).json();

    expect(summary.total).toBe("100.00");
    expect(summary.byCategory).toHaveLength(3);
    const sumPercent = summary.byCategory.reduce((s: number, c: { percent: number }) => s + c.percent, 0);
    const sumCents = summary.byCategory.reduce((s: number, c: { total: string }) => s + amountToCents(c.total), 0);
    expect(sumPercent).toBe(100);
    expect(sumCents).toBe(amountToCents(summary.total));
    // Ordered descending: 33.34 first.
    expect(summary.byCategory[0].category).toBe("HEALTH");
  });
});

