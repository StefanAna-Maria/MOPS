import { randomInt, randomUUID } from "node:crypto";
import app from "../src/index.js";
import { prisma } from "../src/lib/prisma.js";
import { sentEmails } from "../src/lib/email.js";

export const STRONG_PASSWORD = "Parola123";

type RequestOptions = {
  cookie?: string;
  ip?: string;
};

export function uniqueEmail() {
  return `test-${randomUUID()}@example.com`;
}

export function randomIp() {
  return `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

function headers({ cookie, ip }: RequestOptions) {
  return {
    "Content-Type": "application/json",
    Origin: "http://localhost:3000",
    "x-forwarded-for": ip ?? randomIp(),
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

export function get(path: string, options: RequestOptions = {}) {
  return app.request(path, { method: "GET", headers: headers(options) });
}

export function send(method: "POST" | "PATCH", path: string, body: unknown, options: RequestOptions = {}) {
  return app.request(path, { method, headers: headers(options), body: JSON.stringify(body) });
}

export function sessionCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

export function signUp(email: string, password: string, extra: Record<string, unknown> = {}, ip?: string) {
  return send("POST", "/api/auth/sign-up/email", { email, password, name: "", ...extra }, { ip });
}

export function signIn(email: string, password: string, ip?: string) {
  return send("POST", "/api/auth/sign-in/email", { email, password }, { ip });
}

export function verifyEmail(email: string, otp: string, ip?: string) {
  return send("POST", "/api/auth/email-otp/verify-email", { email, otp }, { ip });
}

export function requestNewCode(email: string, ip?: string) {
  return send("POST", "/api/auth/email-otp/send-verification-otp", { email, type: "email-verification" }, { ip });
}

// The database only holds a hash, so the code is read from the email that was "sent".
export function lastCodeSentTo(email: string) {
  const mail = sentEmails().findLast((message) => message.to === email);
  return mail?.text.match(/\b(\d{6})\b/)?.[1];
}

export async function markEmailVerified(email: string) {
  await prisma.user.update({ where: { email }, data: { emailVerified: true } });
}

export async function createSignedInUser(extra: Record<string, unknown> = {}) {
  const email = uniqueEmail();
  await signUp(email, STRONG_PASSWORD, extra);
  await markEmailVerified(email);
  const response = await signIn(email, STRONG_PASSWORD);
  return { email, cookie: sessionCookie(response) };
}

export async function resetDatabase() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "user", "verification", "rateLimit" CASCADE');
}
