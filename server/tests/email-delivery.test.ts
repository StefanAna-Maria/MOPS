import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import { clearSentEmails, sendEmail, sentEmails, verificationEmail } from "../src/lib/email.js";

// No real mail is sent: the Gmail connection and the Resend request are replaced.
vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn() } }));

const createTransport = vi.mocked(nodemailer.createTransport);
const sendMail = vi.fn();
const fetchMock = vi.fn();
const email = verificationEmail("ana@example.com", "123456");

beforeEach(() => {
  clearSentEmails();
  createTransport.mockReset();
  createTransport.mockReturnValue({ sendMail } as unknown as ReturnType<typeof nodemailer.createTransport>);
  sendMail.mockReset().mockResolvedValue({});
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
  // Outside tests, with no provider unless a test configures one (whatever the developer's .env holds).
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("GMAIL_USER", "");
  vi.stubEnv("GMAIL_APP_PASSWORD", "");
  vi.stubEnv("RESEND_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function useGmail() {
  vi.stubEnv("GMAIL_USER", "mops.app@gmail.com");
  vi.stubEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");
}

describe("sendEmail", () => {
  it("keeps the email in memory in tests and sends nothing", async () => {
    vi.stubEnv("NODE_ENV", "test");
    useGmail();

    await sendEmail(email);

    expect(sentEmails()).toEqual([email]);
    expect(createTransport).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("CA-02.1: sends through Gmail over an encrypted connection when it is configured", async () => {
    useGmail();

    await sendEmail(email);

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        // The spaces Google shows between the groups of letters are not part of the password.
        auth: { user: "mops.app@gmail.com", pass: "abcdefghijklmnop" },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith({
      from: { name: "MOPS", address: "mops.app@gmail.com" },
      to: "ana@example.com",
      subject: "Confirmă-ți adresa de email",
      text: email.text,
      html: email.html,
    });
  });

  it("does not wait for a stalled mail server for ever", async () => {
    useGmail();

    await sendEmail(email);

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 10_000 }),
    );
  });

  it("prefers Gmail to Resend when both are configured", async () => {
    useGmail();
    vi.stubEnv("RESEND_API_KEY", "re_test");

    await sendEmail(email);

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a refused Gmail sign-in", async () => {
    useGmail();
    sendMail.mockRejectedValue(new Error("Invalid login: 535-5.7.8 Username and Password not accepted"));

    await expect(sendEmail(email)).rejects.toThrow("Invalid login");
  });

  it.each([
    ["only the address", "mops.app@gmail.com", ""],
    ["only the app password", "", "abcdefghijklmnop"],
  ])("does not use Gmail with %s", async (_case, user, password) => {
    vi.stubEnv("GMAIL_USER", user);
    vi.stubEnv("GMAIL_APP_PASSWORD", password);
    vi.stubEnv("RESEND_API_KEY", "re_test");

    await sendEmail(email);

    expect(createTransport).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses Resend when Gmail is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");

    await sendEmail(email);

    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ method: "POST" }));
  });

  it("reports an email Resend refuses", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    fetchMock.mockResolvedValue({ ok: false, status: 403 });

    await expect(sendEmail(email)).rejects.toThrow("Email provider answered 403");
  });

  it("sends nothing, and does not print the code, without a provider", async () => {
    const log = vi.mocked(console.log);

    await sendEmail(email);

    expect(createTransport).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0].join(" ")).not.toContain("123456");
  });
});
