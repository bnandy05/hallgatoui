import { publicAppUrl } from "@/lib/server/appUrl";
import { runGradeAlerts, type AlertOutcome } from "@/lib/server/gradeAlerts";
import { runDigest, type SendOutcome } from "@/lib/server/digest";
import { getAccountStore } from "@/lib/server/account/store";
import { requestLocale } from "@/lib/server/locale";
import { ALERT_INDEX_KEY, DIGEST_INDEX_KEY, errorResponse, storageErrorResponse } from "@/lib/server/subscription";

// Daily digest run, called by Vercel Cron (vercel.json) with `Authorization: Bearer $CRON_SECRET`.
// Each account gets at most one digest per period, so extra runs are harmless.

export const maxDuration = 60;

const CONCURRENCY = 5;

export async function GET(req: Request): Promise<Response> {
  const locale = requestLocale(req);
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return errorResponse(locale, "unauthorized", 401);
  } else if (process.env.NODE_ENV === "production") {
    return errorResponse(locale, "cron_secret_missing", 503);
  }
  const store = getAccountStore();
  if (!store) return errorResponse(locale, "not_configured", 503);

  let userIds: string[];
  let alertIds: string[];
  try {
    userIds = await store.kv.smembers(DIGEST_INDEX_KEY);
    alertIds = await store.kv.smembers(ALERT_INDEX_KEY);
  } catch {
    return storageErrorResponse(locale);
  }

  const now = new Date();
  const appUrl = publicAppUrl(req);
  const counts: Record<SendOutcome, number> = { sent: 0, skipped: 0, empty: 0, removed: 0, failed: 0 };
  for (let i = 0; i < userIds.length; i += CONCURRENCY) {
    const results = await Promise.allSettled(
      userIds.slice(i, i + CONCURRENCY).map((userId) => runDigest(store, userId, now, appUrl))
    );
    for (const r of results) counts[r.status === "fulfilled" ? r.value : "failed"]++;
  }

  // Urgent grade alerts (opt-in), after the digests: one mail per user per Budapest day at most.
  const alertCounts: Record<AlertOutcome, number> = { sent: 0, skipped: 0, empty: 0, removed: 0, failed: 0 };
  for (let i = 0; i < alertIds.length; i += CONCURRENCY) {
    const results = await Promise.allSettled(
      alertIds.slice(i, i + CONCURRENCY).map((userId) => runGradeAlerts(store, userId, now, appUrl))
    );
    for (const r of results) alertCounts[r.status === "fulfilled" ? r.value : "failed"]++;
  }
  return Response.json({ total: userIds.length, ...counts, alerts: { total: alertIds.length, ...alertCounts } });
}
