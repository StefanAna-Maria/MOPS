import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import {
  STRONG_PASSWORD,
  changePassword,
  createSignedInUser,
  get,
  resetDatabase,
  sessionCookie,
  signIn,
} from "./helpers.js";

const NEW_PASSWORD = "NouaParola9";

beforeEach(async () => {
  await resetDatabase();
});

describe("change password from account settings", () => {
  it("CA-02.16: the right current password and a valid new one change the password", async () => {
    const { email, cookie } = await createSignedInUser();

    const response = await changePassword(STRONG_PASSWORD, NEW_PASSWORD, cookie);

    expect(response.status).toBe(200);
    expect((await signIn(email, NEW_PASSWORD)).status).toBe(200);
    expect((await signIn(email, STRONG_PASSWORD)).status).toBe(401);
  });

  it("CA-02.16: the new password is stored only as a hash", async () => {
    const { email, cookie } = await createSignedInUser();

    await changePassword(STRONG_PASSWORD, NEW_PASSWORD, cookie);

    const account = await prisma.account.findFirstOrThrow({ where: { user: { email } } });
    expect(account.password).not.toContain(NEW_PASSWORD);
    expect(account.password).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
  });

  it("CA-02.17: a wrong current password answers INVALID_PASSWORD and nothing changes", async () => {
    const { email, cookie } = await createSignedInUser();

    const response = await changePassword("Gresita123", NEW_PASSWORD, cookie);

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_PASSWORD");
    expect((await signIn(email, STRONG_PASSWORD)).status).toBe(200);
    expect((await signIn(email, NEW_PASSWORD)).status).toBe(401);
  });

  it.each([
    ["too short", "Pa1"],
    ["without a digit", "Parolaaaa"],
    ["without an uppercase letter", "parola123"],
  ])("CA-02.17, CA-02.20: a new password that is %s, sent straight to the server, answers PASSWORD_TOO_WEAK and nothing changes", async (_reason, weak) => {
    const { email, cookie } = await createSignedInUser();

    const response = await changePassword(STRONG_PASSWORD, weak, cookie);

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("PASSWORD_TOO_WEAK");
    expect((await signIn(email, STRONG_PASSWORD)).status).toBe(200);
  });

  it("requires a signed-in user", async () => {
    const response = await changePassword(STRONG_PASSWORD, NEW_PASSWORD, "");

    expect(response.status).toBe(401);
  });

  it("CA-02.18: the other sessions are closed and the current one stays active", async () => {
    const { email, cookie: currentCookie } = await createSignedInUser();
    const otherCookie = sessionCookie(await signIn(email, STRONG_PASSWORD));
    expect((await get("/api/me", { cookie: otherCookie })).status).toBe(200);

    const response = await changePassword(STRONG_PASSWORD, NEW_PASSWORD, currentCookie);

    expect(response.status).toBe(200);
    expect((await get("/api/me", { cookie: otherCookie })).status).toBe(401);
    expect(await prisma.session.count({ where: { user: { email } } })).toBe(1);
    // The server renews the current session: the app keeps the cookie it receives in this answer.
    const renewedCookie = sessionCookie(response);
    expect(renewedCookie).toContain("session_token");
    expect((await get("/api/me", { cookie: renewedCookie })).status).toBe(200);
  });

  it("CA-02.18: other sessions are closed even if the app does not ask for it", async () => {
    const { email, cookie } = await createSignedInUser();
    const otherCookie = sessionCookie(await signIn(email, STRONG_PASSWORD));

    await changePassword(STRONG_PASSWORD, NEW_PASSWORD, cookie, { revokeOtherSessions: false });

    expect((await get("/api/me", { cookie: otherCookie })).status).toBe(401);
  });

  it("CA-02.17: after a refused change the other sessions stay open", async () => {
    const { email, cookie } = await createSignedInUser();
    const otherCookie = sessionCookie(await signIn(email, STRONG_PASSWORD));

    await changePassword("Gresita123", NEW_PASSWORD, cookie);

    expect((await get("/api/me", { cookie: otherCookie })).status).toBe(200);
  });
});
