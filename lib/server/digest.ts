import { randomBytes } from "node:crypto";
import {
  collectDigest,
  digestPeriodKey,
  shouldSendDigest,
  type DigestFrequency,
  type DigestStatus,
} from "@/lib/digest";
import { renderDigestEmail } from "@/lib/digestEmail";
import type { AccountStore } from "@/lib/server/account/store";
import { userLocale } from "@/lib/server/locale";
import { loadLiveDeadlines } from "@/lib/server/calendar";
import { calendarInput } from "@/lib/server/calendarInput";
import { sendEmail, type OutgoingEmail } from "@/lib/server/email";
import type { Kv } from "@/lib/server/kv";
import { DIGEST_INDEX_KEY, digKey } from "@/lib/server/subscription";

// Server side of the email digest: settings stored per account (the address is the account's
// confirmed email) and the daily send. Server-only.

export interface StoredDigest {
  frequency: DigestFrequency;
  /** Raw: it goes into every digest's unsubscribe link and only allows unsubscribing. */
  unsubscribeKey: string;
  /** digestPeriodKey of the last digest sent (or of the save, so none goes out early). */
  lastPeriod?: string;
  lastSentAt?: string;
}

export function digestStatus(digest: StoredDigest | null): DigestStatus | null {
  if (!digest) return null;
  return { frequency: digest.frequency, lastSentAt: digest.lastSentAt };
}

function randomKey(): string {
  return randomBytes(24).toString("base64url");
}

export function unsubscribeUrl(appUrl: string, userId: string, key: string): string {
  return `${appUrl}/hirlevel?m=leiratkozas&u=${encodeURIComponent(userId)}&k=${encodeURIComponent(key)}`;
}

/** RFC 8058 one-click endpoint (POST), for mail clients' own unsubscribe button. */
function oneClickUrl(appUrl: string, userId: string, key: string): string {
  return `${appUrl}/api/hirlevel?m=leiratkozas&u=${encodeURIComponent(userId)}&k=${encodeURIComponent(key)}`;
}

/**
 * Creates or updates the user's digest. No confirmation: the account email is already
 * confirmed. A new or changed frequency starts with its next period, not with a mail tomorrow.
 */
export async function saveDigest(
  kv: Kv,
  userId: string,
  previous: StoredDigest | null,
  frequency: DigestFrequency,
  now: Date
): Promise<StoredDigest> {
  const next: StoredDigest = {
    ...previous,
    frequency,
    unsubscribeKey: previous?.unsubscribeKey ?? randomKey(),
    lastPeriod: previous && previous.frequency === frequency ? previous.lastPeriod : digestPeriodKey(frequency, now),
  };
  await kv.set(digKey(userId), next);
  await kv.sadd(DIGEST_INDEX_KEY, userId);
  return next;
}

export type LinkResult = "ok" | "invalid";

export async function removeDigest(kv: Kv, userId: string): Promise<void> {
  await kv.del(digKey(userId));
  await kv.srem(DIGEST_INDEX_KEY, userId);
}

/** Unsubscribe link: only the key from the digest mails works. */
export async function unsubscribeDigest(kv: Kv, userId: string, key: string): Promise<LinkResult> {
  const digest = await kv.get<StoredDigest>(digKey(userId));
  if (!digest) return "ok"; // already gone
  if (digest.unsubscribeKey !== key) return "invalid";
  await removeDigest(kv, userId);
  return "ok";
}

export type SendOutcome = "sent" | "skipped" | "empty" | "removed" | "failed";

/** Sends one user's digest if its period hasn't had one yet. */
export async function runDigest(
  store: AccountStore,
  userId: string,
  now: Date,
  appUrl: string,
  send: (email: OutgoingEmail) => Promise<boolean> = sendEmail
): Promise<SendOutcome> {
  const kv = store.kv;
  const digest = await kv.get<StoredDigest>(digKey(userId));
  const user = digest ? await store.getUser(userId) : null;
  if (!digest || !user) {
    // The account is gone: nothing left to summarise.
    await removeDigest(kv, userId);
    return "removed";
  }
  if (!user.emailVerifiedAt) return "skipped";
  const period = digestPeriodKey(digest.frequency, now);
  if (digest.lastPeriod === period) return "skipped";

  const doc = await store.getData(userId);
  if (!doc) return "skipped";
  const input = calendarInput(doc);
  const locale = userLocale(user);
  const { deadlines, warnings } = await loadLiveDeadlines(kv, userId, input, now, locale);
  const content = collectDigest({
    frequency: digest.frequency,
    courses: input.courses,
    deadlines,
    feeds: input.feeds,
    ignoredDuplicatePairs: input.ignoredDuplicatePairs,
    dedupe: input.options.dedupe,
    failingFeeds: warnings.map((w) => w.feedName),
    classSessions: input.classSessions,
    now,
  });

  // A daily mail with nothing due today or tomorrow is noise: the day counts as done.
  if (!shouldSendDigest(digest.frequency, content)) {
    await kv.set(digKey(userId), { ...digest, lastPeriod: period });
    return "empty";
  }

  const unsubscribe = unsubscribeUrl(appUrl, userId, digest.unsubscribeKey);
  const sent = await send({
    to: user.email,
    ...renderDigestEmail({ frequency: digest.frequency, content, now, appUrl, unsubscribeUrl: unsubscribe, locale }),
    headers: {
      "List-Unsubscribe": `<${oneClickUrl(appUrl, userId, digest.unsubscribeKey)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  if (!sent) return "failed"; // retried by the next run
  await kv.set(digKey(userId), { ...digest, lastPeriod: period, lastSentAt: now.toISOString() });
  return "sent";
}
