import { randomBytes } from "node:crypto";
import { digestGradesFrom } from "@/lib/digest";
import { renderGradeAlertEmail } from "@/lib/gradeAlertEmail";
import { ALERT_KIND_LIST, filterAlerts, gradeAlerts } from "@/lib/gradeAlerts";
import { budapestDate, dateKey } from "@/lib/ical/budapest";
import type { AccountStore } from "@/lib/server/account/store";
import { loadLiveDeadlines } from "@/lib/server/calendar";
import { calendarInput } from "@/lib/server/calendarInput";
import { sendEmail, type OutgoingEmail } from "@/lib/server/email";
import type { Kv } from "@/lib/server/kv";
import { userLocale } from "@/lib/server/locale";
import { ALERT_INDEX_KEY, alrKey } from "@/lib/server/subscription";
import { GRADE_ALERT_SENT_DAYS } from "@/lib/legal";
import type { AlertKinds } from "@/lib/types";

// Server side of the emailed grade alerts (opt-in, account-owned): the settings record and the
// daily run. Server-only. The record is `alr:<userId>`; no record = email off.

/** A sent key is forgotten after this long. */
export const SENT_KEEP_DAYS = GRADE_ALERT_SENT_DAYS;
/** The same alert at another severity is held back for this long after it was sent. */
export const RESEND_AFTER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StoredAlerts {
  kinds: AlertKinds;
  /** Raw: it goes into every alert mail's unsubscribe link and only allows unsubscribing. */
  unsubscribeKey: string;
  /** `<alert key>|<severity>` → ISO of the mail that told about it. */
  sent: Record<string, string>;
  /** Budapest day (YYYYMMDD) of the last urgent mail: at most one a day. */
  lastUrgentDay?: string;
}

const randomKey = () => randomBytes(24).toString("base64url");

export const allKindsOff = (kinds: AlertKinds): boolean => ALERT_KIND_LIST.every((k) => !kinds[k]);

/** The kinds object from untrusted JSON for the PUT route: every kind must be a boolean. */
export function emailKindsFrom(value: unknown): AlertKinds | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const out = {} as AlertKinds;
  for (const k of ALERT_KIND_LIST) {
    if (typeof o[k] !== "boolean") return null;
    out[k] = o[k];
  }
  return out;
}

export function alertsUnsubscribeUrl(appUrl: string, userId: string, key: string): string {
  return `${appUrl}/hirlevel?m=riaszto&u=${encodeURIComponent(userId)}&k=${encodeURIComponent(key)}`;
}

/** RFC 8058 one-click endpoint (POST). */
function oneClickUrl(appUrl: string, userId: string, key: string): string {
  return `${appUrl}/api/hirlevel?m=riaszto&u=${encodeURIComponent(userId)}&k=${encodeURIComponent(key)}`;
}

export async function removeAlerts(kv: Kv, userId: string): Promise<void> {
  await kv.del(alrKey(userId));
  await kv.srem(ALERT_INDEX_KEY, userId);
}

/**
 * Creates or updates the record. All kinds off deletes it (email off) and returns null. Turning
 * email on starts with an empty `sent`, so the first mail only tells about what is urgent then.
 */
export async function saveAlerts(
  kv: Kv,
  userId: string,
  previous: StoredAlerts | null,
  kinds: AlertKinds
): Promise<StoredAlerts | null> {
  if (allKindsOff(kinds)) {
    await removeAlerts(kv, userId);
    return null;
  }
  const next: StoredAlerts = { sent: {}, ...previous, kinds, unsubscribeKey: previous?.unsubscribeKey ?? randomKey() };
  await kv.set(alrKey(userId), next);
  await kv.sadd(ALERT_INDEX_KEY, userId);
  return next;
}

export type AlertLinkResult = "ok" | "invalid";

/** Unsubscribe link: only the key from the alert mails works, and it only turns the alerts off. */
export async function unsubscribeAlerts(kv: Kv, userId: string, key: string): Promise<AlertLinkResult> {
  const record = await kv.get<StoredAlerts>(alrKey(userId));
  if (!record) return "ok"; // already off
  if (record.unsubscribeKey !== key) return "invalid";
  await removeAlerts(kv, userId);
  return "ok";
}

export type AlertOutcome = "sent" | "skipped" | "empty" | "removed" | "failed";

const sentKey = (key: string, severity: string) => `${key}|${severity}`;

/**
 * Sends the urgent alerts that have not been told yet: at most one mail per Budapest day, only
 * the email kinds, only a key not sent before at this severity (and, if it was sent at another
 * severity, not within `RESEND_AFTER_DAYS`).
 */
export async function runGradeAlerts(
  store: AccountStore,
  userId: string,
  now: Date,
  appUrl: string,
  send: (email: OutgoingEmail) => Promise<boolean> = sendEmail
): Promise<AlertOutcome> {
  const kv = store.kv;
  const record = await kv.get<StoredAlerts>(alrKey(userId));
  const user = record ? await store.getUser(userId) : null;
  if (!record || !user) {
    await removeAlerts(kv, userId);
    return "removed";
  }
  if (!user.emailVerifiedAt) return "skipped";
  const today = dateKey(budapestDate(now));
  if (record.lastUrgentDay === today) return "skipped";

  const doc = await store.getData(userId);
  if (!doc || (doc.data.requirementRules ?? []).length === 0) return "empty";
  const input = calendarInput(doc);
  const locale = userLocale(user);
  const { deadlines } = await loadLiveDeadlines(kv, userId, input, now, locale);
  const catchUp = {
    courses: doc.data.courses,
    rules: doc.data.requirementRules ?? [],
    results: doc.data.requirementResults ?? [],
    sessions: input.classSessions,
    deadlines,
    semester: doc.data.semester,
    now,
  };

  const alerts = filterAlerts(gradeAlerts(catchUp, locale), record.kinds);
  const nowMs = now.getTime();
  // Forget keys older than SENT_KEEP_DAYS.
  const sent: Record<string, string> = {};
  for (const [k, at] of Object.entries(record.sent ?? {})) {
    if (nowMs - Date.parse(at) <= SENT_KEEP_DAYS * DAY_MS) sent[k] = at;
  }
  const recentOtherSeverity = (key: string, severity: string) =>
    Object.entries(sent).some(([k, at]) => {
      const i = k.lastIndexOf("|");
      return k.slice(0, i) === key && k.slice(i + 1) !== severity && nowMs - Date.parse(at) < RESEND_AFTER_DAYS * DAY_MS;
    });
  const fresh = alerts.filter((a) => a.urgent && !sent[sentKey(a.key, a.severity)] && !recentOtherSeverity(a.key, a.severity));
  if (fresh.length === 0) {
    if (Object.keys(sent).length !== Object.keys(record.sent ?? {}).length) await kv.set(alrKey(userId), { ...record, sent });
    return "empty";
  }

  const unsubscribe = alertsUnsubscribeUrl(appUrl, userId, record.unsubscribeKey);
  const ok = await send({
    to: user.email,
    ...renderGradeAlertEmail({ alerts: digestGradesFrom(fresh, doc.data.courses), appUrl, unsubscribeUrl: unsubscribe, locale }),
    headers: {
      "List-Unsubscribe": `<${oneClickUrl(appUrl, userId, record.unsubscribeKey)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  if (!ok) return "failed"; // retried by the next run
  for (const a of fresh) sent[sentKey(a.key, a.severity)] = now.toISOString();
  await kv.set(alrKey(userId), { ...record, sent, lastUrgentDay: today });
  return "sent";
}
