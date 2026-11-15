import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { clearSentEmails, sentEmails } from "../src/lib/email.js";
import {
  STRONG_PASSWORD,
  createSignedInUser,
  get,
  lastCodeSentTo,
  randomIp,
  requestPasswordReset,
  resetDatabase,
  resetPassword,
  sessionCookie,
  signIn,
  uniqueEmail,
} from "./helpers.js";

const RESET_SUBJECT = "Resetează-ți parola";
const NEW_PASSWORD = "NouaParola9";

async function accountWithCode() {
  const { email, cookie } = await createSignedInUser();
  clearSentEmails();
  await requestPasswordReset(email);
  return { email, cookie, code: lastCodeSentTo(email, RESET_SUBJECT)! };
}

beforeEach(async () => {
  await resetDatabase();
  clearSentEmails();
});

describe("password reset", () => {
  it("CA-02.11: asking for a reset sends a 6-digit code to the account's email", async () => {
    const { email } = await createSignedInUser();
    clearSentEmails();

    const response = await requestPasswordReset(email);

    expect(response.status).toBe(200);
    const messages = sentEmails().filter((message) => message.to === email);
    expect(messages).toHaveLength(1);
    expect(messages[0].subject).toBe(RESET_SUBJECT);
    expect(messages[0].text).toMatch(/\b\d{6}\b/);
  });

  it("CA-02.11: the code is stored only as a hash and lasts 5 minutes", async () => {
    const { email, code } = await accountWithCode();

    const row = await prisma.verification.findFirstOrThrow({ where: { identifier: `forget-password-otp-${email}` } });

    expect(row.value).not.toContain(code);
    const seconds = (row.expiresAt.getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(290);
    expect(seconds).toBeLessThanOrEqual(300);
  });

  it("CA-02.12: the right code and a valid password change the password", async () => {
    const { email, code } = await accountWithCode();

    const response = await resetPassword(email, code, NEW_PASSWORD);

    expect(response.status).toBe(200);
    expect((await signIn(email, NEW_PASSWORD)).status).toBe(200);
    expect((await signIn(email, STRONG_PASSWORD)).status).toBe(401);
  });

  it("CA-02.12: the user can sign in right after the reset", async () => {
    const { email, code } = await accountWithCode();
    await resetPassword(email, code, NEW_PASSWORD);

    const response = await signIn(email, NEW_PASSWORD);

    expect(response.status).toBe(200);
    expect((await get("/api/me", { cookie: sessionCookie(response) })).status).toBe(200);
  });

  it("CA-02.12: a weak password is refused and the code is not used up", async () => {
    const { email, code } = await accountWithCode();

    const weak = await resetPassword(email, code, "parola");

    expect(weak.status).toBe(400);
    expect((await weak.json()).code).toBe("PASSWORD_TOO_WEAK");
    expect((await signIn(email, STRONG_PASSWORD)).status).toBe(200);
    expect((await resetPassword(email, code, NEW_PASSWORD)).status).toBe(200);
  });

  it("CA-02.12: a wrong code answers INVALID_OTP and the password stays the same", async () => {
    const { email, code } = await accountWithCode();
    const wrong = code === "000000" ? "111111" : "000000";

    const response = await resetPassword(email, wrong, NEW_PASSWORD);

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_OTP");
    expect((await signIn(email, STRONG_PASSWORD)).status).toBe(200);
  });

  it("CA-02.12: an expired code answers OTP_EXPIRED", async () => {
    const { email, code } = await accountWithCode();
    await prisma.verification.updateMany({
      where: { identifier: `forget-password-otp-${email}` },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await resetPassword(email, code, NEW_PASSWORD);

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("OTP_EXPIRED");
  });

  it("CA-02.12: a code works only once", async () => {
    const { email, code } = await accountWithCode();
    await resetPassword(email, code, NEW_PASSWORD);

    const response = await resetPassword(email, code, "AltaParola7");

    expect(response.status).toBe(400);
    expect((await signIn(email, NEW_PASSWORD)).status).toBe(200);
  });

  it("CA-02.13: an address without an account gets the same answer and nothing is sent", async () => {
    const { email } = await createSignedInUser();
    clearSentEmails();

    const known = await requestPasswordReset(email);
    const unknownEmail = uniqueEmail();
    const unknown = await requestPasswordReset(unknownEmail);

    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(sentEmails().filter((message) => message.to === unknownEmail)).toHaveLength(0);
    expect(await prisma.verification.count({ where: { identifier: { contains: unknownEmail } } })).toBe(0);
  });

  it("CA-02.14: the new password closes the other sessions of the account", async () => {
    const { email, cookie: firstCookie } = await createSignedInUser();
    const secondCookie = sessionCookie(await signIn(email, STRONG_PASSWORD));
    expect((await get("/api/me", { cookie: firstCookie })).status).toBe(200);
    expect((await get("/api/me", { cookie: secondCookie })).status).toBe(200);
    clearSentEmails();
    await requestPasswordReset(email);
    const code = lastCodeSentTo(email, RESET_SUBJECT)!;

    await resetPassword(email, code, NEW_PASSWORD);

    expect((await get("/api/me", { cookie: firstCookie })).status).toBe(401);
    expect((await get("/api/me", { cookie: secondCookie })).status).toBe(401);
    expect(await prisma.session.count({ where: { user: { email } } })).toBe(0);
  });

  it("too many reset requests from one device are limited", async () => {
    const { email } = await createSignedInUser();
    const ip = randomIp();

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      statuses.push((await requestPasswordReset(email, ip)).status);
    }

    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });
});
