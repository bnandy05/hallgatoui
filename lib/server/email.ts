import type { RenderedEmail } from "@/lib/digestEmail";

// Sends email through Resend's REST API (plain fetch, no SDK). Env: RESEND_API_KEY and
// DIGEST_FROM ("Hallgatói réteg <hirlevel@example.hu>", a verified Resend sender). Without them
// the mail is logged in dev, and email is reported as unavailable in production.
// Server-only.

const RESEND_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

export function isEmailConfigured(): boolean {
  if (process.env.RESEND_API_KEY && process.env.DIGEST_FROM) return true;
  return process.env.NODE_ENV !== "production";
}

export interface OutgoingEmail extends RenderedEmail {
  to: string;
  headers?: Record<string, string>;
}

/** Returns true when the provider accepted the message. Never throws. */
export async function sendEmail(email: OutgoingEmail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_FROM;
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") return false;
    console.info(`[email] (dev, nincs elküldve) ${email.to}: ${email.subject}\n${email.text}`);
    return true;
  }
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: email.headers,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) console.error(`[email] Resend ${res.status}: ${await res.text().catch(() => "")}`);
    return res.ok;
  } catch (err) {
    console.error("[email] Resend request failed", err);
    return false;
  }
}
