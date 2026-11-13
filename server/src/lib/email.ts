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

export async function sendEmail(email: Email) {
  if (process.env.NODE_ENV === "test") {
    outbox.push(email);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Development: no provider configured; the code itself is printed by auth.ts.
    console.log(`[email] not sent (no RESEND_API_KEY): to=${email.to} subject="${email.subject}"`);
    return;
  }

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

export function verificationEmail(to: string, otp: string): Email {
  return {
    to,
    subject: "Confirmă-ți adresa de email",
    text: `Codul tău de confirmare este ${otp}. Expiră în 5 minute.\nDacă nu ai creat tu un cont, ignoră acest mesaj.`,
    html: `<p>Codul tău de confirmare este:</p><p style="font-size:28px;letter-spacing:6px"><b>${otp}</b></p><p>Expiră în 5 minute. Dacă nu ai creat tu un cont, ignoră acest mesaj.</p>`,
  };
}
