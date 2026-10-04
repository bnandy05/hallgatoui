import { randomBytes } from "node:crypto";
import {
  collectDigest,
  digestPeriodKey,
  isDigestEmpty,
  renderConfirmEmail,
  renderDigestEmail,
  type DigestFrequency,
  type DigestStatus,
} from "@/lib/digest";
import { loadLiveDeadlines } from "@/lib/server/calendar";
import { sendEmail } from "@/lib/server/email";
import type { Kv } from "@/lib/server/kv";
import {
  DIGEST_INDEX_KEY,
  digKey,
  hashSecret,
  subKey,
  TTL_SECONDS,
  type StoredSubscription,
} from "@/lib/server/subscription";

// Server side of the email digest: settings stored next to a calendar subscription, double
// opt-in, and the daily send. Server-only.

export const CONFIRM_WINDOW_MS = 48 * 60 * 60 * 1000;

export interface StoredDigest {
  email: string;
  frequency: DigestFrequency;
  confirmed: boolean;
  /** sha256 of the confirmation key; only while unconfirmed. */
  confirmHash?: string;
  requestedAt: string;
  /** Raw: it goes into every digest's unsubscribe link and only allows unsubscribing. */
  unsubscribeKey: string;
  /** digestPeriodKey of the last digest sent (or of the confirmation, so none goes out early). */
  lastPeriod?: string;
  lastSentAt?: string;
}

export function digestStatus(digest: StoredDigest | null): DigestStatus | null {
  if (!digest) return null;
  return {
    email: digest.email,
    frequency: digest.frequency,
    confirmed: digest.confirmed,
    lastSentAt: digest.lastSentAt,
  };
}

function randomKey(): string {
  return randomBytes(24).toString("base64url");
}

export function confirmUrl(appUrl: string, token: string, key: string): string {
  return `${appUrl}/hirlevel?m=megerosites&t=${encodeURIComponent(token)}&k=${encodeURIComponent(key)}`;
}

export function unsubscribeUrl(appUrl: string, token: string, key: string): string {
  return `${appUrl}/hirlevel?m=leiratkozas&t=${encodeURIComponent(token)}&k=${encodeURIComponent(key)}`;
}

/** RFC 8058 one-click endpoint (POST), for mail clients' own unsubscribe button. */
function oneClickUrl(appUrl: string, token: string, key: string): string {
  return `${appUrl}/api/hirlevel?m=leiratkozas&t=${encodeURIComponent(token)}&k=${encodeURIComponent(key)}`;
}

/**
 * Saves the settings. A new address starts unconfirmed and gets a confirmation mail; changing
 * only the frequency of a confirmed address keeps it confirmed. Returns the stored digest, or
 * null when the confirmation mail could not be sent.
 */
export async function requestDigest(
  kv: Kv,
  token: string,
  previous: StoredDigest | null,
  email: string,
  frequency: DigestFrequency,
  appUrl: string,
  now: Date
): Promise<StoredDigest | null> {
  if (previous && previous.email === email && previous.confirmed) {
    const next: StoredDigest = {
      ...previous,
      frequency,
      // A new frequency starts with its next period, not with a mail tomorrow morning.
      lastPeriod: previous.frequency === frequency ? previous.lastPeriod : digestPeriodKey(frequency, now),
    };
    await kv.set(digKey(token), next, TTL_SECONDS);
    return next;
  }

  const key = randomKey();
  const next: StoredDigest = {
    email,
    frequency,
    confirmed: false,
    confirmHash: hashSecret(key),
    requestedAt: now.toISOString(),
    unsubscribeKey: previous?.unsubscribeKey ?? randomKey(),
  };
  const sent = await sendEmail({ to: email, ...renderConfirmEmail({ frequency, confirmUrl: confirmUrl(appUrl, token, key) }) });
  if (!sent) return null;
  await kv.set(digKey(token), next, TTL_SECONDS);
  await kv.sadd(DIGEST_INDEX_KEY, token);
  return next;
}

export type LinkResult = "ok" | "invalid" | "expired";

export async function confirmDigest(kv: Kv, token: string, key: string, now: Date): Promise<LinkResult> {
  const digest = await kv.get<StoredDigest>(digKey(token));
  if (!digest) return "invalid";
  if (digest.confirmed) return "ok"; // a second click on the same link
  if (!digest.confirmHash || digest.confirmHash !== hashSecret(key)) return "invalid";
  if (now.getTime() - new Date(digest.requestedAt).getTime() > CONFIRM_WINDOW_MS) return "expired";
  const next: StoredDigest = {
    ...digest,
    confirmed: true,
    confirmHash: undefined,
    lastPeriod: digestPeriodKey(digest.frequency, now),
  };
  await kv.set(digKey(token), next, TTL_SECONDS);
  await kv.sadd(DIGEST_INDEX_KEY, token);
  return "ok";
}

export async function removeDigest(kv: Kv, token: string): Promise<void> {
  await kv.del(digKey(token));
  await kv.srem(DIGEST_INDEX_KEY, token);
}

/** Unsubscribe link: only the key from the digest mails works. */
export async function unsubscribeDigest(kv: Kv, token: string, key: string): Promise<LinkResult> {
  const digest = await kv.get<StoredDigest>(digKey(token));
  if (!digest) return "ok"; // already gone
  if (digest.unsubscribeKey !== key) return "invalid";
  await removeDigest(kv, token);
  return "ok";
}

export type SendOutcome = "sent" | "skipped" | "empty" | "removed" | "failed";

/** Sends one subscription's digest if its period hasn't had one yet. */
export async function runDigest(kv: Kv, token: string, now: Date, appUrl: string): Promise<SendOutcome> {
  const digest = await kv.get<StoredDigest>(digKey(token));
  const sub = digest ? await kv.get<StoredSubscription>(subKey(token)) : null;
  if (!digest || !sub) {
    // The subscription expired or was deleted: nothing left to summarise.
    await removeDigest(kv, token);
    return "removed";
  }
  if (!digest.confirmed) {
    if (now.getTime() - new Date(digest.requestedAt).getTime() > CONFIRM_WINDOW_MS) {
      await removeDigest(kv, token);
      return "removed";
    }
    return "skipped";
  }
  const period = digestPeriodKey(digest.frequency, now);
  if (digest.lastPeriod === period) return "skipped";

  const { deadlines, warnings } = await loadLiveDeadlines(kv, token, sub, now);
  const content = collectDigest({
    frequency: digest.frequency,
    courses: sub.snapshot.courses,
    deadlines,
    feeds: sub.snapshot.feeds,
    ignoredDuplicatePairs: sub.snapshot.ignoredDuplicatePairs ?? [],
    dedupe: sub.snapshot.options.dedupe,
    failingFeeds: warnings.map((w) => w.feedName),
    now,
  });

  const done: StoredDigest = { ...digest, lastPeriod: period };
  // An empty daily mail is noise; weekly and monthly ones still confirm that nothing is due.
  if (digest.frequency === "napi" && isDigestEmpty(content)) {
    await kv.set(digKey(token), done, TTL_SECONDS);
    return "empty";
  }

  const unsubscribe = unsubscribeUrl(appUrl, token, digest.unsubscribeKey);
  const sent = await sendEmail({
    to: digest.email,
    ...renderDigestEmail({ frequency: digest.frequency, content, now, appUrl, unsubscribeUrl: unsubscribe }),
    headers: {
      "List-Unsubscribe": `<${oneClickUrl(appUrl, token, digest.unsubscribeKey)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  if (!sent) return "failed"; // retried by the next run
  await kv.set(digKey(token), { ...done, lastSentAt: now.toISOString() }, TTL_SECONDS);
  return "sent";
}
