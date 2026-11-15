import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { STRONG_PASSWORD, createSignedInUser, get, resetDatabase, signIn, signUp, markEmailVerified, uniqueEmail, sessionCookie } from "./helpers.js";

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await resetDatabase();
});

async function onlySession(email: string) {
  return prisma.session.findFirstOrThrow({ where: { user: { email } } });
}

describe("kept session", () => {
  it("CA-02.9: a new session lasts 60 days", async () => {
    const { email } = await createSignedInUser();

    const session = await onlySession(email);

    const days = (session.expiresAt.getTime() - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(59.9);
    expect(days).toBeLessThanOrEqual(60);
  });

  it("CA-02.9: the cookie sent to the app lasts 60 days", async () => {
    const email = uniqueEmail();
    await signUp(email, STRONG_PASSWORD);
    await markEmailVerified(email);

    const response = await signIn(email, STRONG_PASSWORD);

    const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token"));
    expect(cookie).toMatch(/Max-Age=5184000/i);
  });

  it("CA-02.9: using the app pushes the expiry 60 days from the last use", async () => {
    const { email, cookie } = await createSignedInUser();
    const before = await onlySession(email);
    await prisma.session.update({
      where: { id: before.id },
      data: { expiresAt: new Date(Date.now() + 30 * DAY_MS), updatedAt: new Date(Date.now() - 30 * DAY_MS) },
    });

    const response = await get("/api/auth/get-session", { cookie });

    expect(response.status).toBe(200);
    const after = await onlySession(email);
    const days = (after.expiresAt.getTime() - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(59.9);
  });

  it("CA-02.9: a session unused for more than 60 days is no longer accepted", async () => {
    const { email, cookie } = await createSignedInUser();
    const session = await onlySession(email);
    await prisma.session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await get("/api/me", { cookie })).status).toBe(401);
    expect(await (await get("/api/auth/get-session", { cookie })).json()).toBeNull();
  });

  it("CA-02.8: a stored session still opens the app after a long pause", async () => {
    const { email, cookie } = await createSignedInUser();
    const session = await onlySession(email);
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() + 2 * DAY_MS), updatedAt: new Date(Date.now() - 58 * DAY_MS) },
    });

    const response = await get("/api/me", { cookie });

    expect(response.status).toBe(200);
  });

  it("CA-02.10: a session closed on the server gets 401 and no session", async () => {
    const { email, cookie } = await createSignedInUser();
    expect((await get("/api/me", { cookie })).status).toBe(200);
    await prisma.session.deleteMany({ where: { user: { email } } });

    const me = await get("/api/me", { cookie });
    const session = await get("/api/auth/get-session", { cookie });

    expect(me.status).toBe(401);
    expect(await session.json()).toBeNull();
  });

  it("CA-02.10: closing one session leaves the cookie of a new sign-in valid", async () => {
    const { email, cookie } = await createSignedInUser();
    await prisma.session.deleteMany({ where: { user: { email } } });

    const again = await signIn(email, STRONG_PASSWORD);

    expect((await get("/api/me", { cookie })).status).toBe(401);
    expect((await get("/api/me", { cookie: sessionCookie(again) })).status).toBe(200);
  });
});
