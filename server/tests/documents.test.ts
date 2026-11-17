import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index.js";
import { prisma } from "../src/lib/prisma.js";
import { createSignedInUser, get, resetDatabase, send } from "./helpers.js";

const PATH = "/api/documents/manual";

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validExpense(extra: Record<string, unknown> = {}) {
  return {
    clientRequestId: randomUUID(),
    description: "Piața Obor",
    amount: "12,5",
    date: todayIso(),
    ...extra,
  };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("POST /api/documents/manual", () => {
  it("returns 401 without a session", async () => {
    expect((await send("POST", PATH, validExpense())).status).toBe(401);
  });

  it("CA-03.1 / CA-03.5: saves a manual expense with one line named like the description and no time", async () => {
    const { cookie } = await createSignedInUser();

    const response = await send(
      "POST",
      PATH,
      validExpense({ category: "GROCERIES", paymentMethod: "CARD", note: "legume" }),
      { cookie },
    );

    expect(response.status).toBe(201);
    const { document } = await response.json();
    expect(document).toMatchObject({
      type: "MANUAL",
      merchant: "Piața Obor",
      date: todayIso(),
      time: null,
      total: "12.50",
      category: "GROCERIES",
      paymentMethod: "CARD",
      note: "legume",
    });
    expect(document.lines).toEqual([
      { id: expect.any(String), position: 1, name: "Piața Obor", amount: "12.50", category: "GROCERIES" },
    ]);
  });

  it("uses Altele, Numerar and no note by default", async () => {
    const { cookie } = await createSignedInUser();

    const { document } = await (await send("POST", PATH, validExpense(), { cookie })).json();

    expect(document).toMatchObject({ category: "OTHER", paymentMethod: "CASH", note: null });
  });

  it("CA-03.2: rejects an empty description", async () => {
    const { cookie } = await createSignedInUser();

    const response = await send("POST", PATH, validExpense({ description: "   " }), { cookie });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_EXPENSE", fields: ["description"] });
  });

  it.each(["0", "-5", "12,345"])("CA-03.3: rejects the amount %s", async (amount) => {
    const { cookie } = await createSignedInUser();

    const response = await send("POST", PATH, validExpense({ amount }), { cookie });

    expect(response.status).toBe(400);
    expect((await response.json()).fields).toEqual(["amount"]);
  });

  it.each([
    ["12,5", "12.50"],
    ["12.50", "12.50"],
  ])("CA-03.3: accepts the amount %s", async (amount, total) => {
    const { cookie } = await createSignedInUser();

    const response = await send("POST", PATH, validExpense({ amount }), { cookie });

    expect(response.status).toBe(201);
    expect((await response.json()).document.total).toBe(total);
  });

  it("CA-03.4: rejects a date in the future and accepts a past date", async () => {
    const { cookie } = await createSignedInUser();

    const future = await send("POST", PATH, validExpense({ date: addDays(todayIso(), 1) }), { cookie });
    const past = await send("POST", PATH, validExpense({ date: addDays(todayIso(), -30) }), { cookie });

    expect(future.status).toBe(400);
    expect((await future.json()).fields).toEqual(["date"]);
    expect(past.status).toBe(201);
  });

  it("CA-03.4: judges 'today' in the phone's time zone (X-Time-Zone)", async () => {
    const { cookie } = await createSignedInUser();
    const farAhead = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Kiritimati" }).format(new Date());
    const farBehind = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Pago_Pago" }).format(new Date());

    const request = (timeZone: string) =>
      app.request(PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie, "X-Time-Zone": timeZone },
        body: JSON.stringify(validExpense({ date: farAhead })),
      });

    expect((await request("Pacific/Kiritimati")).status).toBe(201);
    if (farAhead !== farBehind) {
      expect((await request("Pacific/Pago_Pago")).status).toBe(400);
    }
  });

  it("rejects an unknown category or payment method and a note over 500 characters", async () => {
    const { cookie } = await createSignedInUser();

    const response = await send(
      "POST",
      PATH,
      validExpense({ category: "FOOD", paymentMethod: "CRYPTO", note: "x".repeat(501) }),
      { cookie },
    );

    expect(response.status).toBe(400);
    expect((await response.json()).fields).toEqual(["category", "paymentMethod", "note"]);
  });

  it("rejects a request without a valid request id", async () => {
    const { cookie } = await createSignedInUser();

    const response = await send("POST", PATH, validExpense({ clientRequestId: "x" }), { cookie });

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_REQUEST_ID");
  });

  it("rejects a request body that is not valid JSON", async () => {
    const { cookie } = await createSignedInUser();

    const response = await app.request(PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: "{not json",
    });

    expect(response.status).toBe(400);
  });

  it("CA-03.6: a retry with the same request id saves the expense only once", async () => {
    const { cookie } = await createSignedInUser();
    const expense = validExpense();

    const first = await send("POST", PATH, expense, { cookie });
    const retry = await send("POST", PATH, expense, { cookie });

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect((await retry.json()).document.id).toBe((await first.json()).document.id);
    expect(await prisma.document.count()).toBe(1);
  });

  it("CA-03.6: two simultaneous taps save the expense only once", async () => {
    const { cookie } = await createSignedInUser();
    const expense = validExpense();

    const responses = await Promise.all([
      send("POST", PATH, expense, { cookie }),
      send("POST", PATH, expense, { cookie }),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(await prisma.document.count()).toBe(1);
    expect(await prisma.documentLine.count()).toBe(1);
  });

  it("CA-03.7: always saves the expense in the signed-in user's account", async () => {
    const victim = await createSignedInUser();
    const victimUser = await prisma.user.findUniqueOrThrow({ where: { email: victim.email } });
    const attacker = await createSignedInUser();

    const response = await send("POST", PATH, validExpense({ userId: victimUser.id }), { cookie: attacker.cookie });

    expect(response.status).toBe(201);
    expect(await prisma.document.count({ where: { userId: victimUser.id } })).toBe(0);
  });

  it("CA-03.7: the same request id from two users creates two separate expenses", async () => {
    const first = await createSignedInUser();
    const second = await createSignedInUser();
    const expense = validExpense();

    const a = await (await send("POST", PATH, expense, { cookie: first.cookie })).json();
    const b = await send("POST", PATH, expense, { cookie: second.cookie });

    expect(b.status).toBe(201);
    expect((await b.json()).document.id).not.toBe(a.document.id);
  });
});

describe("GET /api/documents", () => {
  function list(cookie: string, timeZone?: string) {
    return app.request("/api/documents", {
      method: "GET",
      headers: { Cookie: cookie, ...(timeZone ? { "X-Time-Zone": timeZone } : {}) },
    });
  }

  async function userId(email: string) {
    return (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  }

  function createDocument(ownerId: string, date: string, merchant: string, extra: Record<string, unknown> = {}) {
    return prisma.document.create({
      data: {
        userId: ownerId,
        type: "MANUAL",
        merchant,
        date: new Date(`${date}T00:00:00.000Z`),
        total: "10.00",
        category: "OTHER",
        paymentMethod: "CASH",
        clientRequestId: randomUUID(),
        lines: { create: [{ position: 1, name: merchant, amount: "10.00", category: "OTHER" }] },
        ...extra,
      },
    });
  }

  it("returns 401 without a session", async () => {
    expect((await app.request("/api/documents")).status).toBe(401);
  });

  it("CA-04.4: returns an empty list when there are no documents", async () => {
    const { cookie } = await createSignedInUser();

    const response = await list(cookie);

    expect(response.status).toBe(200);
    expect((await response.json()).documents).toEqual([]);
  });

  it("CA-04.1: returns only this month's documents, newest first", async () => {
    const { cookie, email } = await createSignedInUser();
    const id = await userId(email);
    const today = todayIso();
    const firstOfMonth = `${today.slice(0, 8)}01`;
    await createDocument(id, firstOfMonth, "Prima zi");
    await createDocument(id, today, "Azi, mai devreme");
    await createDocument(id, today, "Azi, mai târziu");
    await createDocument(id, addDays(firstOfMonth, -1), "Luna trecută");

    const body = await (await list(cookie, "Europe/Bucharest")).json();

    expect(body.month).toBe(today.slice(0, 7));
    const merchants = body.documents.map((d: { merchant: string }) => d.merchant);
    // On the 1st all three share the date and the newest created comes first, so the order is the same.
    expect(merchants).toEqual(["Azi, mai târziu", "Azi, mai devreme", "Prima zi"]);
    expect(body.documents[0]).toMatchObject({ type: "MANUAL", total: "10.00", category: "OTHER", time: null });
  });

  it("CA-04.1: within the same day, a document with a time comes before the newer ones without", async () => {
    const { cookie, email } = await createSignedInUser();
    const id = await userId(email);
    await createDocument(id, todayIso(), "Bon 09:15", { time: "09:15" });
    await createDocument(id, todayIso(), "Bon 18:40", { time: "18:40" });
    await createDocument(id, todayIso(), "Manuală");

    const body = await (await list(cookie, "Europe/Bucharest")).json();

    expect(body.documents.map((d: { merchant: string }) => d.merchant)).toEqual(["Bon 18:40", "Bon 09:15", "Manuală"]);
  });

  it("CA-04.5: the month is the one in the phone's time zone", async () => {
    const { cookie } = await createSignedInUser();
    const ahead = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Kiritimati" }).format(new Date());
    const behind = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Pago_Pago" }).format(new Date());

    expect((await (await list(cookie, "Pacific/Kiritimati")).json()).month).toBe(ahead.slice(0, 7));
    expect((await (await list(cookie, "Pacific/Pago_Pago")).json()).month).toBe(behind.slice(0, 7));
  });

  it("CA-04.6: does not show another user's documents", async () => {
    const owner = await createSignedInUser();
    await createDocument(await userId(owner.email), todayIso(), "Al altcuiva");
    const other = await createSignedInUser();

    const body = await (await list(other.cookie)).json();

    expect(body.documents).toEqual([]);
  });
});

describe("GET /api/documents/:id", () => {
  async function addExpense(cookie: string, extra: Record<string, unknown> = {}) {
    const response = await send("POST", PATH, validExpense(extra), { cookie });
    return (await response.json()).document as { id: string };
  }

  it("returns 401 without a session", async () => {
    expect((await app.request("/api/documents/abc")).status).toBe(401);
  });

  it("CA-06.1: returns the document with its lines", async () => {
    const { cookie } = await createSignedInUser();
    const created = await addExpense(cookie, { category: "HEALTH", paymentMethod: "TRANSFER", note: "rețetă" });

    const response = await get(`/api/documents/${created.id}`, { cookie });

    expect(response.status).toBe(200);
    const { document } = await response.json();
    expect(document).toMatchObject({
      id: created.id,
      merchant: "Piața Obor",
      date: todayIso(),
      time: null,
      total: "12.50",
      category: "HEALTH",
      paymentMethod: "TRANSFER",
      note: "rețetă",
    });
    expect(document.lines).toEqual([
      { id: expect.any(String), position: 1, name: "Piața Obor", amount: "12.50", category: "HEALTH" },
    ]);
  });

  it("CA-06.1: also returns documents from earlier months", async () => {
    const { cookie } = await createSignedInUser();
    const created = await addExpense(cookie, { date: addDays(todayIso(), -60) });

    expect((await get(`/api/documents/${created.id}`, { cookie })).status).toBe(200);
  });

  it("CA-06.2: returns 404 for a document that does not exist", async () => {
    const { cookie } = await createSignedInUser();

    const response = await get("/api/documents/does-not-exist", { cookie });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "DOCUMENT_NOT_FOUND" });
  });

  it("CA-06.2: returns the same 404 for another user's document", async () => {
    const owner = await createSignedInUser();
    const created = await addExpense(owner.cookie);
    const other = await createSignedInUser();

    const response = await get(`/api/documents/${created.id}`, { cookie: other.cookie });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "DOCUMENT_NOT_FOUND" });
  });
});

describe("personal and company documents", () => {
  const company = { cui: "RO 14399840", name: "Exemplu SRL", address: "Str. Exemplu nr. 1, București" };

  async function userWithCompany() {
    const user = await createSignedInUser();
    await send("POST", "/api/company", company, { cookie: user.cookie });
    return user;
  }

  async function add(cookie: string, description: string, context?: string) {
    return send("POST", PATH, validExpense({ description, ...(context ? { context } : {}) }), { cookie });
  }

  async function listMerchants(cookie: string, context?: string) {
    const response = await get(`/api/documents${context ? `?context=${context}` : ""}`, { cookie });
    return (await response.json()).documents.map((d: { merchant: string }) => d.merchant);
  }

  it("saves a company expense in the company and a personal one in the personal profile", async () => {
    const { cookie } = await userWithCompany();

    const personal = await (await add(cookie, "Cumpărături", "personal")).json();
    const business = await (await add(cookie, "Consumabile birou", "company")).json();

    expect(personal.document.context).toBe("personal");
    expect(business.document.context).toBe("company");
  });

  it("keeps the personal and company lists separate, both ways", async () => {
    const { cookie } = await userWithCompany();
    await add(cookie, "Cumpărături", "personal");
    await add(cookie, "Consumabile birou", "company");

    expect(await listMerchants(cookie, "personal")).toEqual(["Cumpărături"]);
    expect(await listMerchants(cookie, "company")).toEqual(["Consumabile birou"]);
  });

  it("uses the personal profile when no profile is sent", async () => {
    const { cookie } = await userWithCompany();
    await add(cookie, "Fără profil");
    await add(cookie, "Consumabile birou", "company");

    expect(await listMerchants(cookie)).toEqual(["Fără profil"]);
  });

  it("refuses the company profile for a user without a company", async () => {
    const { cookie } = await createSignedInUser();

    const save = await add(cookie, "Consumabile", "company");
    const list = await get("/api/documents?context=company", { cookie });

    expect(save.status).toBe(404);
    expect((await save.json()).code).toBe("COMPANY_NOT_FOUND");
    expect(list.status).toBe(404);
    expect(await prisma.document.count()).toBe(0);
  });

  it("refuses an unknown profile", async () => {
    const { cookie } = await createSignedInUser();

    const save = await add(cookie, "Ceva", "family");
    const list = await get("/api/documents?context=family", { cookie });

    expect(save.status).toBe(400);
    expect((await save.json()).code).toBe("INVALID_CONTEXT");
    expect(list.status).toBe(400);
  });

  it("never shows another user's company documents", async () => {
    const owner = await userWithCompany();
    await add(owner.cookie, "Al firmei altcuiva", "company");
    const other = await userWithCompany();

    expect(await listMerchants(other.cookie, "company")).toEqual([]);
  });
});
