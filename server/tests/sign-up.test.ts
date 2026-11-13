import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { STRONG_PASSWORD, resetDatabase, signUp, uniqueEmail } from "./helpers.js";

beforeEach(async () => {
  await resetDatabase();
});

describe("sign-up", () => {
  it("CA-01.3: creates an unconfirmed account for a new email and a valid password", async () => {
    const email = uniqueEmail();

    const response = await signUp(email, STRONG_PASSWORD);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.token).toBeNull();
    expect(body.user.email).toBe(email);
    expect(body.user.emailVerified).toBe(false);
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.emailVerified).toBe(false);
  });

  it("CA-01.3: sends a verification code after sign-up", async () => {
    const email = uniqueEmail();

    await signUp(email, STRONG_PASSWORD);

    const verification = await prisma.verification.findFirst({
      where: { identifier: `email-verification-otp-${email}` },
    });
    expect(verification).not.toBeNull();
  });

  it.each([
    ["too short", "Pa1"],
    ["without a digit", "Parolaaaa"],
    ["without an uppercase letter", "parola123"],
  ])("CA-01.4: rejects a password that is %s with PASSWORD_TOO_WEAK", async (_reason, password) => {
    const email = uniqueEmail();

    const response = await signUp(email, password);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("PASSWORD_TOO_WEAK");
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it("CA-01.5: answers an existing email the same way as a new one", async () => {
    const existingEmail = uniqueEmail();
    await signUp(existingEmail, STRONG_PASSWORD);

    const newResponse = await signUp(uniqueEmail(), STRONG_PASSWORD);
    const existingResponse = await signUp(existingEmail, "AltaParola9");

    expect(existingResponse.status).toBe(newResponse.status);
    const newBody = await newResponse.json();
    const existingBody = await existingResponse.json();
    expect(Object.keys(existingBody).sort()).toEqual(Object.keys(newBody).sort());
    expect(Object.keys(existingBody.user).sort()).toEqual(Object.keys(newBody.user).sort());
    expect(existingBody.token).toBeNull();
    expect(existingBody.user.emailVerified).toBe(false);
    expect(await prisma.user.count({ where: { email: existingEmail } })).toBe(1);
  });

  it("CA-01.6: stores the password only as a hash", async () => {
    const email = uniqueEmail();

    await signUp(email, STRONG_PASSWORD);

    const account = await prisma.account.findFirst({ where: { user: { email } } });
    expect(account?.password).toBeTruthy();
    expect(account?.password).not.toBe(STRONG_PASSWORD);
    expect(account?.password).not.toContain(STRONG_PASSWORD);
    expect(account?.password).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
  });

  it("saves the chosen usage type", async () => {
    const email = uniqueEmail();

    await signUp(email, STRONG_PASSWORD, { usageType: "COMPANY" });

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.usageType).toBe("COMPANY");
  });

  it("uses PERSONAL when no usage type is sent", async () => {
    const email = uniqueEmail();

    await signUp(email, STRONG_PASSWORD);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.usageType).toBe("PERSONAL");
  });

  it("rejects an unknown usage type", async () => {
    const email = uniqueEmail();

    const response = await signUp(email, STRONG_PASSWORD, { usageType: "ADMIN" });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("INVALID_USAGE_TYPE");
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });
});
