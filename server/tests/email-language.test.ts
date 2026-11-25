import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index.js";
import { clearSentEmails, emailLanguage, sentEmails } from "../src/lib/email.js";
import { STRONG_PASSWORD, markEmailVerified, randomIp, resetDatabase, uniqueEmail } from "./helpers.js";

function post(path: string, body: unknown, language?: string) {
  return app.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      "x-forwarded-for": randomIp(),
      ...(language ? { "Accept-Language": language } : {}),
    },
    body: JSON.stringify(body),
  });
}

function subjectSentTo(email: string) {
  return sentEmails().findLast((message) => message.to === email)?.subject;
}

beforeEach(async () => {
  await resetDatabase();
  clearSentEmails();
});

describe("emailLanguage", () => {
  it.each([
    ["en", "en"],
    ["en-US,en;q=0.9", "en"],
    ["ro", "ro"],
    ["ro-RO", "ro"],
    ["de", "ro"],
    [null, "ro"],
    [undefined, "ro"],
  ])("Accept-Language %s → %s", (header, expected) => {
    expect(emailLanguage(header)).toBe(expected);
  });
});

describe("US-17: the emails with a code follow the app's language", () => {
  it("the confirmation email is in English when the app is in English", async () => {
    const email = uniqueEmail();

    await post("/api/auth/sign-up/email", { email, password: STRONG_PASSWORD, name: "" }, "en");

    expect(subjectSentTo(email)).toBe("Confirm your email address");
  });

  it("the confirmation email is in Romanian when the app is in Romanian, and by default", async () => {
    const romanian = uniqueEmail();
    const noHeader = uniqueEmail();

    await post("/api/auth/sign-up/email", { email: romanian, password: STRONG_PASSWORD, name: "" }, "ro");
    await post("/api/auth/sign-up/email", { email: noHeader, password: STRONG_PASSWORD, name: "" });

    expect(subjectSentTo(romanian)).toBe("Confirmă-ți adresa de email");
    expect(subjectSentTo(noHeader)).toBe("Confirmă-ți adresa de email");
  });

  it("the password reset email follows the app's language", async () => {
    const email = uniqueEmail();
    await post("/api/auth/sign-up/email", { email, password: STRONG_PASSWORD, name: "" }, "ro");
    await markEmailVerified(email);

    await post("/api/auth/email-otp/request-password-reset", { email }, "en");

    expect(subjectSentTo(email)).toBe("Reset your password");
    expect(sentEmails().findLast((message) => message.to === email)?.text).toMatch(/^Your password reset code is \d{6}\./);
  });
});
