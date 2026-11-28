import nodemailer from "nodemailer";

export type Email = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

// In tests the emails are kept in memory so that the code can be read back (the database only has its hash).
const outbox: Email[] = [];

export function sentEmails() {
  return outbox;
}

export function clearSentEmails() {
  outbox.length = 0;
}

/** How long a stalled connection to the mail server is waited for, so a request does not hang. */
const SMTP_TIMEOUT_MS = 10_000;

/**
 * Sends through Gmail when GMAIL_USER and GMAIL_APP_PASSWORD are set (free, reaches any address), otherwise through
 * Resend when RESEND_API_KEY is set. Without either, nothing is sent (the code is printed by auth.ts in development).
 */
export async function sendEmail(email: Email) {
  if (process.env.NODE_ENV === "test") {
    outbox.push(email);
    return;
  }

  const gmailUser = process.env.GMAIL_USER?.trim();
  // Google shows an app password in groups of four letters; the spaces are not part of it.
  const gmailPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (gmailUser && gmailPassword) {
    await sendWithGmail(email, gmailUser, gmailPassword);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email] not sent (no email provider configured): to=${email.to} subject="${email.subject}"`);
    return;
  }
  await sendWithResend(email, apiKey);
}

async function sendWithGmail(email: Email, user: string, password: string) {
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: password },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
  // Gmail only sends from the account that signs in, so EMAIL_FROM is not used here.
  await transport.sendMail({
    from: { name: "MOPS", address: user },
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

async function sendWithResend(email: Email, apiKey: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "MOPS <onboarding@resend.dev>",
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });
  if (!response.ok) {
    throw new Error(`Email provider answered ${response.status}`);
  }
}

/** US-17: the language of the emails with a code, from the app's Accept-Language header (Romanian by default). */
export type EmailLanguage = "ro" | "en";

export function emailLanguage(acceptLanguage: string | null | undefined): EmailLanguage {
  return acceptLanguage?.trim().toLowerCase().startsWith("en") ? "en" : "ro";
}

const code = (otp: string) => `<p style="font-size:28px;letter-spacing:6px"><b>${otp}</b></p>`;

export function passwordResetEmail(to: string, otp: string, language: EmailLanguage = "ro"): Email {
  if (language === "en") {
    return {
      to,
      subject: "Reset your password",
      text: `Your password reset code is ${otp}. It expires in 5 minutes.
If you did not ask for a reset, ignore this message.`,
      html: `<p>Your password reset code is:</p>${code(otp)}<p>It expires in 5 minutes. If you did not ask for a reset, ignore this message.</p>`,
    };
  }
  return {
    to,
    subject: "Resetează-ți parola",
    text: `Codul tău pentru resetarea parolei este ${otp}. Expiră în 5 minute.
Dacă nu ai cerut tu resetarea, ignoră acest mesaj.`,
    html: `<p>Codul tău pentru resetarea parolei este:</p>${code(otp)}<p>Expiră în 5 minute. Dacă nu ai cerut tu resetarea, ignoră acest mesaj.</p>`,
  };
}

export function verificationEmail(to: string, otp: string, language: EmailLanguage = "ro"): Email {
  if (language === "en") {
    return {
      to,
      subject: "Confirm your email address",
      text: `Your confirmation code is ${otp}. It expires in 5 minutes.
If you did not create an account, ignore this message.`,
      html: `<p>Your confirmation code is:</p>${code(otp)}<p>It expires in 5 minutes. If you did not create an account, ignore this message.</p>`,
    };
  }
  return {
    to,
    subject: "Confirmă-ți adresa de email",
    text: `Codul tău de confirmare este ${otp}. Expiră în 5 minute.
Dacă nu ai creat tu un cont, ignoră acest mesaj.`,
    html: `<p>Codul tău de confirmare este:</p>${code(otp)}<p>Expiră în 5 minute. Dacă nu ai creat tu un cont, ignoră acest mesaj.</p>`,
  };
}
