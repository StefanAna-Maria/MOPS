import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import {
  STRONG_PASSWORD,
  markEmailVerified,
  randomIp,
  resetDatabase,
  sessionCookie,
  signIn,
  signUp,
  uniqueEmail,
} from "./helpers.js";

beforeEach(async () => {
  await resetDatabase();
});

describe("sign-in", () => {
  it("CA-01.8: signs in a confirmed account with the right credentials", async () => {
    const email = uniqueEmail();
    await signUp(email, STRONG_PASSWORD);
    await markEmailVerified(email);

    const response = await signIn(email, STRONG_PASSWORD);

    expect(response.status).toBe(200);
    expect(sessionCookie(response)).toContain("session_token");
    expect(await prisma.session.count({ where: { user: { email } } })).toBe(1);
  });

  it("CA-01.9: rejects a wrong password with INVALID_EMAIL_OR_PASSWORD", async () => {
    const email = uniqueEmail();
    await signUp(email, STRONG_PASSWORD);
    await markEmailVerified(email);

    const response = await signIn(email, "Gresita123");

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("CA-01.9: rejects an unknown email with the same error", async () => {
    const response = await signIn(uniqueEmail(), STRONG_PASSWORD);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("CA-01.10: an unconfirmed account gets EMAIL_NOT_VERIFIED and a new code", async () => {
    const email = uniqueEmail();
    await signUp(email, STRONG_PASSWORD);
    const identifier = `email-verification-otp-${email}`;
    const before = await prisma.verification.findMany({ where: { identifier } });

    const response = await signIn(email, STRONG_PASSWORD);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe("EMAIL_NOT_VERIFIED");
    const after = await prisma.verification.findMany({ where: { identifier } });
    const previousIds = new Set(before.map((row) => row.id));
    const newCodes = after.filter((row) => !previousIds.has(row.id));
    expect(newCodes).toHaveLength(1);
    expect(await prisma.session.count({ where: { user: { email } } })).toBe(0);
  });

  it("CA-01.11: blocks too many attempts in one minute from the same device", async () => {
    const email = uniqueEmail();
    await signUp(email, STRONG_PASSWORD);
    await markEmailVerified(email);
    const ip = randomIp();

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await signIn(email, "Gresita123", ip);
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  it("CA-01.11: the limit does not affect another device", async () => {
    const email = uniqueEmail();
    await signUp(email, STRONG_PASSWORD);
    await markEmailVerified(email);
    const blockedIp = randomIp();
    for (let attempt = 0; attempt < 6; attempt++) {
      await signIn(email, "Gresita123", blockedIp);
    }

    const response = await signIn(email, STRONG_PASSWORD, randomIp());

    expect(response.status).toBe(200);
  });
});
