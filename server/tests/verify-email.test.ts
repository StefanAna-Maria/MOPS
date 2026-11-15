import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { clearSentEmails, sentEmails } from "../src/lib/email.js";
import {
  STRONG_PASSWORD,
  get,
  lastCodeSentTo,
  randomIp,
  requestNewCode,
  resetDatabase,
  sessionCookie,
  signIn,
  signUp,
  uniqueEmail,
  verifyEmail,
} from "./helpers.js";

const WRONG_CODE = "000000";

async function newUnconfirmedAccount() {
  const email = uniqueEmail();
  await signUp(email, STRONG_PASSWORD);
  const code = lastCodeSentTo(email)!;
  return { email, code };
}

function otpIdentifier(email: string) {
  return `email-verification-otp-${email}`;
}

beforeEach(async () => {
  await resetDatabase();
  clearSentEmails();
});

describe("email confirmation", () => {
  it("CA-02.1: sign-up sends 'Confirmă-ți adresa de email' with a 6-digit code", async () => {
    const email = uniqueEmail();

    await signUp(email, STRONG_PASSWORD);

    const messages = sentEmails().filter((message) => message.to === email);
    expect(messages).toHaveLength(1);
    expect(messages[0].subject).toBe("Confirmă-ți adresa de email");
    expect(messages[0].text).toMatch(/\b\d{6}\b/);
  });

  it("CA-02.3: the right code confirms the address and signs the user in", async () => {
    const { email, code } = await newUnconfirmedAccount();

    const response = await verifyEmail(email, code);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe(true);
    expect(body.token).toBeTruthy();
    expect(body.user.emailVerified).toBe(true);
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.emailVerified).toBe(true);
    expect(await prisma.session.count({ where: { user: { email } } })).toBe(1);

    const me = await get("/api/me", { cookie: sessionCookie(response) });
    expect(me.status).toBe(200);
  });

  it("CA-02.3: after confirmation the account can sign in with the password", async () => {
    const { email, code } = await newUnconfirmedAccount();
    await verifyEmail(email, code);

    const response = await signIn(email, STRONG_PASSWORD);

    expect(response.status).toBe(200);
  });

  it("CA-02.4: a wrong code answers INVALID_OTP and the account stays unconfirmed", async () => {
    const { email } = await newUnconfirmedAccount();

    const response = await verifyEmail(email, WRONG_CODE);

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_OTP");
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.emailVerified).toBe(false);
    expect(await prisma.session.count({ where: { user: { email } } })).toBe(0);
  });

  it("CA-02.4: after a wrong try the right code still works", async () => {
    const { email, code } = await newUnconfirmedAccount();
    await verifyEmail(email, WRONG_CODE);

    const response = await verifyEmail(email, code);

    expect(response.status).toBe(200);
  });

  it("CA-02.4: the code is blocked after too many wrong tries", async () => {
    const { email, code } = await newUnconfirmedAccount();
    for (let attempt = 0; attempt < 3; attempt++) {
      await verifyEmail(email, WRONG_CODE);
    }

    const response = await verifyEmail(email, code);

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("CA-02.5: the code is valid for 5 minutes", async () => {
    const { email } = await newUnconfirmedAccount();

    const row = await prisma.verification.findFirstOrThrow({ where: { identifier: otpIdentifier(email) } });

    const seconds = (row.expiresAt.getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(290);
    expect(seconds).toBeLessThanOrEqual(300);
  });

  it("CA-02.5: an expired code answers OTP_EXPIRED", async () => {
    const { email, code } = await newUnconfirmedAccount();
    await prisma.verification.updateMany({
      where: { identifier: otpIdentifier(email) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await verifyEmail(email, code);

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("OTP_EXPIRED");
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.emailVerified).toBe(false);
  });

  it("CA-02.6: asking for a new code sends another email and the old code stops working", async () => {
    const { email, code: oldCode } = await newUnconfirmedAccount();

    const response = await requestNewCode(email);

    expect(response.status).toBe(200);
    expect(sentEmails().filter((message) => message.to === email)).toHaveLength(2);
    const newCode = lastCodeSentTo(email)!;
    if (newCode !== oldCode) {
      expect((await verifyEmail(email, oldCode)).status).toBe(400);
    }
    expect((await verifyEmail(email, newCode)).status).toBe(200);
  });

  it("CA-02.6: asking for a code for an unknown address sends nothing", async () => {
    const email = uniqueEmail();

    const response = await requestNewCode(email);

    expect(response.status).toBe(200);
    expect(sentEmails().filter((message) => message.to === email)).toHaveLength(0);
  });

  it("CA-02.6: too many code requests from one device are limited", async () => {
    const { email } = await newUnconfirmedAccount();
    const ip = randomIp();

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      statuses.push((await requestNewCode(email, ip)).status);
    }

    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });

  it("CA-02.7: the code is stored only as a hash", async () => {
    const { email, code } = await newUnconfirmedAccount();

    const row = await prisma.verification.findFirstOrThrow({ where: { identifier: otpIdentifier(email) } });

    expect(row.value).not.toContain(code);
    expect(row.value).toMatch(/^[0-9A-Za-z+/=_-]{20,}:\d+$/);
  });
});
