import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { createSignedInUser, get, resetDatabase, send } from "./helpers.js";

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
}

async function addExpense(cookie: string, description: string, amount: string) {
  const response = await send(
    "POST",
    "/api/documents/manual",
    { clientRequestId: randomUUID(), description, amount, date: todayIso() },
    { cookie },
  );
  return (await response.json()).document as { id: string };
}

function remove(id: string, cookie?: string) {
  return send("DELETE", `/api/documents/${id}`, undefined, { cookie });
}

async function listTotals(cookie: string) {
  const { documents } = await (await get("/api/documents?context=personal", { cookie })).json();
  return (documents as { merchant: string; total: string }[]).map((document) => document.merchant);
}

beforeEach(async () => {
  await resetDatabase();
});

describe("DELETE /api/documents/:id", () => {
  it("returns 401 without a session", async () => {
    expect((await remove("abc")).status).toBe(401);
  });

  it("CA-07.1: deletes the document and its products, so it leaves the list and the totals", async () => {
    const { cookie } = await createSignedInUser();
    const wrong = await addExpense(cookie, "Plată greșită", "50");
    await addExpense(cookie, "Piața Obor", "12,5");

    const response = await remove(wrong.id, cookie);

    expect(response.status).toBe(204);
    expect(await listTotals(cookie)).toEqual(["Piața Obor"]);
    expect(await prisma.documentLine.count({ where: { documentId: wrong.id } })).toBe(0);
    expect((await get(`/api/documents/${wrong.id}`, { cookie })).status).toBe(404);
  });

  it("CA-07.2: cannot delete another user's document, which stays saved", async () => {
    const owner = await createSignedInUser();
    const document = await addExpense(owner.cookie, "Al altcuiva", "20");
    const other = await createSignedInUser();

    const response = await remove(document.id, other.cookie);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "DOCUMENT_NOT_FOUND" });
    expect(await listTotals(owner.cookie)).toEqual(["Al altcuiva"]);
  });

  it("returns 404 for a missing document and for one already deleted", async () => {
    const { cookie } = await createSignedInUser();
    const document = await addExpense(cookie, "Plată greșită", "50");
    await remove(document.id, cookie);

    expect((await remove(document.id, cookie)).status).toBe(404);
    expect((await remove("missing", cookie)).status).toBe(404);
  });

  it("deleting a scanned document keeps its photo stored", async () => {
    const { email, cookie } = await createSignedInUser();
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
        total: "10.00",
        category: "GROCERIES",
        paymentMethod: "CARD",
        clientRequestId: `scan-${fileId}`,
        fileId,
        lines: { create: [{ position: 1, name: "Pâine", amount: "10.00", category: "GROCERIES" }] },
      },
    });

    expect((await remove(document.id, cookie)).status).toBe(204);
    expect(await prisma.file.count({ where: { id: fileId } })).toBe(1);
  });
});
