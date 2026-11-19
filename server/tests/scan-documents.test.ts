import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { createSignedInUser, get, resetDatabase, send } from "./helpers.js";

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
}

async function createScan(email: string, options: { status?: string; companyId?: string | null } = {}) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const id = randomUUID().replace(/-/g, "");
  await prisma.file.create({
    data: {
      id,
      userId: user.id,
      companyId: options.companyId ?? null,
      originalName: "receipt.jpg",
      mimeType: "image/jpeg",
      size: 12,
      storageKey: `${user.id}/${id}.jpg`,
      ocrResult: { create: { status: options.status ?? "DONE" } },
    },
  });
  return id;
}

function checkedValues(extra: Record<string, unknown> = {}) {
  return {
    merchant: "Carrefour Express",
    date: todayIso(),
    time: "17:58",
    total: "26.17",
    paymentMethod: "CARD",
    category: "GROCERIES",
    items: [
      { name: "PARTY MIX 60G", amount: "29.37", category: "GROCERIES" },
      { name: "DISCOUNT", amount: "-3.20", category: "GROCERIES" },
    ],
    ...extra,
  };
}

function save(scanId: string, body: unknown, cookie?: string) {
  return send("POST", `/api/scans/${scanId}/document`, body, { cookie });
}

beforeEach(async () => {
  await resetDatabase();
});

describe("POST /api/scans/:id/document", () => {
  it("returns 401 without a session", async () => {
    expect((await save("missing", checkedValues())).status).toBe(401);
  });

  it("CA-11.4: saves the checked values as a scanned document with the photo attached", async () => {
    const { email, cookie } = await createSignedInUser();
    const scanId = await createScan(email);

    const response = await save(scanId, checkedValues(), cookie);

    expect(response.status).toBe(201);
    const { document } = await response.json();
    expect(document).toMatchObject({
      context: "personal",
      type: "SCANNED",
      merchant: "Carrefour Express",
      date: todayIso(),
      time: "17:58",
      total: "26.17",
      category: "GROCERIES",
      paymentMethod: "CARD",
      note: null,
      fileId: scanId,
    });
    expect(document.lines).toEqual([
      { id: expect.any(String), position: 1, name: "PARTY MIX 60G", amount: "29.37", category: "GROCERIES" },
      { id: expect.any(String), position: 2, name: "DISCOUNT", amount: "-3.20", category: "GROCERIES" },
    ]);
  });

  it("CA-11.4: the saved document appears on Acasă and its detail has the photo", async () => {
    const { email, cookie } = await createSignedInUser();
    const scanId = await createScan(email);
    const { document } = await (await save(scanId, checkedValues(), cookie)).json();

    const list = await (await get("/api/documents?context=personal", { cookie })).json();
    const detail = await (await get(`/api/documents/${document.id}`, { cookie })).json();

    expect(list.documents).toEqual([expect.objectContaining({ id: document.id, type: "SCANNED", fileId: scanId })]);
    expect(detail.document).toMatchObject({ id: document.id, fileId: scanId });
  });

  it("a manual expense has no photo", async () => {
    const { cookie } = await createSignedInUser();

    const response = await send(
      "POST",
      "/api/documents/manual",
      { clientRequestId: randomUUID(), description: "Piața Obor", amount: "12,5", date: todayIso() },
      { cookie },
    );

    expect((await response.json()).document.fileId).toBeNull();
  });

  it("CA-11.3: refuses a document whose products do not add up to the total, and saves nothing", async () => {
    const { email, cookie } = await createSignedInUser();
    const scanId = await createScan(email);

    const response = await save(scanId, checkedValues({ total: "30.00" }), cookie);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_DOCUMENT", fields: ["itemsTotal"] });
    expect(await prisma.document.count()).toBe(0);
  });

  it("CA-11.3: refuses invalid values", async () => {
    const { email, cookie } = await createSignedInUser();
    const scanId = await createScan(email);

    const response = await save(scanId, checkedValues({ merchant: " ", date: "2099-01-01" }), cookie);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_DOCUMENT", fields: ["merchant", "date"] });
  });

  it("returns 404 for a missing scan and for another user's scan, and saves nothing", async () => {
    const owner = await createSignedInUser();
    const other = await createSignedInUser();
    const scanId = await createScan(owner.email);

    const missing = await save("missing", checkedValues(), other.cookie);
    const foreign = await save(scanId, checkedValues(), other.cookie);

    expect(missing.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual({ code: "SCAN_NOT_FOUND" });
    expect(await prisma.document.count()).toBe(0);
  });

  it.each(["PROCESSING", "FAILED"])("refuses a scan that is %s with 409", async (status) => {
    const { email, cookie } = await createSignedInUser();
    const scanId = await createScan(email, { status });

    const response = await save(scanId, checkedValues(), cookie);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: "SCAN_NOT_READY" });
  });

  it("a photo becomes a single document: saving it again returns the document saved the first time", async () => {
    const { email, cookie } = await createSignedInUser();
    const scanId = await createScan(email);

    const first = await save(scanId, checkedValues(), cookie);
    const second = await save(scanId, checkedValues({ merchant: "Alt magazin" }), cookie);

    expect(second.status).toBe(200);
    expect((await second.json()).document.id).toBe((await first.json()).document.id);
    expect(await prisma.document.count()).toBe(1);
  });

  it("two simultaneous saves of the same photo create a single document", async () => {
    const { email, cookie } = await createSignedInUser();
    const scanId = await createScan(email);

    const [first, second] = await Promise.all([
      save(scanId, checkedValues(), cookie),
      save(scanId, checkedValues(), cookie),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(await prisma.document.count()).toBe(1);
  });

  it("a photo taken in the company profile is saved in the company profile", async () => {
    const { email, cookie } = await createSignedInUser();
    const { company } = await (
      await send("POST", "/api/company", { cui: "RO 14399840", name: "Exemplu SRL", address: "Str. 1" }, { cookie })
    ).json();
    const scanId = await createScan(email, { companyId: company.id });

    const { document } = await (await save(scanId, checkedValues(), cookie)).json();
    const companyList = await (await get("/api/documents?context=company", { cookie })).json();
    const personalList = await (await get("/api/documents?context=personal", { cookie })).json();

    expect(document.context).toBe("company");
    expect(companyList.documents).toHaveLength(1);
    expect(personalList.documents).toHaveLength(0);
  });
});
