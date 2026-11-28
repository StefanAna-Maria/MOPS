import { randomUUID } from "node:crypto";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index.js";
import { prisma } from "../src/lib/prisma.js";
import { saveUpload, sourcePdfKeyFor, storageKeyFor, uploadDir } from "../src/lib/uploads.js";
import {
  STRONG_PASSWORD,
  createSignedInUser,
  get,
  requestPasswordReset,
  resetDatabase,
  send,
  sessionCookie,
  signIn,
  signUp,
} from "./helpers.js";

// The uploaded files of these tests go to a folder of their own, never to the developer's uploads.
let folder: string;

beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "mops-delete-"));
  vi.stubEnv("UPLOAD_DIR", folder);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(folder, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetDatabase();
});

function deleteMe(cookie?: string) {
  return app.request("/api/me", {
    method: "DELETE",
    headers: { Origin: "http://localhost:3000", ...(cookie ? { Cookie: cookie } : {}) },
  });
}

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

/** A user with one of everything: profile, company, category, documents (manual and scanned) and uploaded files. */
async function userWithData() {
  const user = await createSignedInUser();
  const { id: userId } = await prisma.user.findUniqueOrThrow({ where: { email: user.email } });
  await get("/api/me", { cookie: user.cookie });
  await send("POST", "/api/company", { cui: "RO 14399840", name: "Exemplu SRL", address: "Str. 1" }, {
    cookie: user.cookie,
  });
  await send("POST", "/api/categories", { name: "Sală de sport" }, { cookie: user.cookie });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
  await send(
    "POST",
    "/api/documents/manual",
    { clientRequestId: randomUUID(), description: "Piață", amount: "10", date: today },
    { cookie: user.cookie },
  );

  const fileId = randomUUID().replace(/-/g, "");
  const storageKey = storageKeyFor(userId, fileId, "image/png");
  await saveUpload(storageKey, new Uint8Array([1, 2, 3]));
  await saveUpload(sourcePdfKeyFor(storageKey), new Uint8Array([4, 5, 6]));
  await prisma.file.create({
    data: {
      id: fileId,
      userId,
      originalName: "factura.pdf",
      mimeType: "image/png",
      size: 3,
      storageKey,
      ocrResult: { create: { status: "DONE" } },
      document: {
        create: {
          userId,
          type: "SCANNED",
          merchant: "Carrefour",
          date: new Date(`${today}T00:00:00.000Z`),
          total: "10.00",
          category: "GROCERIES",
          paymentMethod: "CARD",
          clientRequestId: `scan-${fileId}`,
          lines: { create: [{ position: 1, name: "Pâine", amount: "10.00", category: "GROCERIES" }] },
        },
      },
    },
  });
  return { ...user, userId, storageKey };
}

async function rowsOf(userId: string) {
  const [users, sessions, accounts, profiles, companies, categories, documents, lines, files, readings] =
    await Promise.all([
      prisma.user.count({ where: { id: userId } }),
      prisma.session.count({ where: { userId } }),
      prisma.account.count({ where: { userId } }),
      prisma.profile.count({ where: { userId } }),
      prisma.company.count({ where: { ownerId: userId } }),
      prisma.category.count({ where: { userId } }),
      prisma.document.count({ where: { userId } }),
      prisma.documentLine.count({ where: { document: { userId } } }),
      prisma.file.count({ where: { userId } }),
      prisma.ocrResult.count({ where: { file: { userId } } }),
    ]);
  return { users, sessions, accounts, profiles, companies, categories, documents, lines, files, readings };
}

describe("DELETE /api/me", () => {
  it("returns 401 without a session, and deletes nothing", async () => {
    const user = await userWithData();

    expect((await deleteMe()).status).toBe(401);
    expect((await rowsOf(user.userId)).users).toBe(1);
  });

  it("CA-12.1: deletes the account, its sessions, documents and everything else it holds", async () => {
    const user = await userWithData();
    await signIn(user.email, STRONG_PASSWORD);
    const before = await rowsOf(user.userId);
    expect(Object.values(before).every((count) => count > 0)).toBe(true);
    expect(before.sessions).toBe(2);

    const response = await deleteMe(user.cookie);

    expect(response.status).toBe(204);
    expect(Object.values(await rowsOf(user.userId)).every((count) => count === 0)).toBe(true);
    expect(await prisma.documentLine.count()).toBe(0);
    expect(await prisma.ocrResult.count()).toBe(0);
  });

  it("CA-12.1: removes the uploaded photos and PDFs from disk", async () => {
    const user = await userWithData();
    const picture = path.join(uploadDir(), user.storageKey);
    const pdf = path.join(uploadDir(), sourcePdfKeyFor(user.storageKey));
    expect(await exists(picture)).toBe(true);
    expect(await exists(pdf)).toBe(true);

    await deleteMe(user.cookie);

    expect(await exists(picture)).toBe(false);
    expect(await exists(pdf)).toBe(false);
    expect(await exists(path.join(uploadDir(), user.userId))).toBe(false);
  });

  it("CA-12.1: removes the codes emailed to the address", async () => {
    const user = await userWithData();
    await requestPasswordReset(user.email);
    const codes = () => prisma.verification.count({ where: { identifier: { endsWith: `-otp-${user.email}` } } });
    expect(await codes()).toBeGreaterThan(0);

    await deleteMe(user.cookie);

    expect(await codes()).toBe(0);
  });

  it("CA-12.1: the other users keep their account, documents and files", async () => {
    const leaving = await userWithData();
    const staying = await userWithData();
    await requestPasswordReset(staying.email);
    const before = await rowsOf(staying.userId);

    await deleteMe(leaving.cookie);

    expect(await rowsOf(staying.userId)).toEqual(before);
    expect(await exists(path.join(uploadDir(), staying.storageKey))).toBe(true);
    expect(await prisma.verification.count({ where: { identifier: `forget-password-otp-${staying.email}` } })).toBe(1);
    expect((await get("/api/me", { cookie: staying.cookie })).status).toBe(200);
  });

  it("works for an account that never uploaded anything", async () => {
    const user = await createSignedInUser();

    expect((await deleteMe(user.cookie)).status).toBe(204);
    expect(await prisma.user.count({ where: { email: user.email } })).toBe(0);
  });

  it("CA-12.2: signing in with the old details fails", async () => {
    const user = await userWithData();

    await deleteMe(user.cookie);
    const response = await signIn(user.email, STRONG_PASSWORD);

    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("CA-12.2: the old sessions are refused on every device", async () => {
    const user = await userWithData();
    const second = sessionCookie(await signIn(user.email, STRONG_PASSWORD));

    await deleteMe(user.cookie);

    for (const cookie of [user.cookie, second]) {
      expect((await get("/api/me", { cookie })).status).toBe(401);
      expect((await get("/api/documents?context=personal", { cookie })).status).toBe(401);
      expect(await (await get("/api/auth/get-session", { cookie })).json()).toBeNull();
    }
    expect((await deleteMe(user.cookie)).status).toBe(401);
  });

  it("CA-12.2: the address can be used again for a new, empty account", async () => {
    const user = await userWithData();
    await deleteMe(user.cookie);

    const response = await signUp(user.email, STRONG_PASSWORD);

    expect(response.status).toBe(200);
    const created = await prisma.user.findUniqueOrThrow({ where: { email: user.email } });
    expect(created.id).not.toBe(user.userId);
    expect(await prisma.document.count({ where: { userId: created.id } })).toBe(0);
  });
});
