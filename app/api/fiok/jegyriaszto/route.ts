import { isEmailConfigured } from "@/lib/server/email";
import { checkOrigin, guarded, json, mutation, requireUser } from "@/lib/server/auth/http";
import { emailKindsFrom, removeAlerts, saveAlerts, type StoredAlerts } from "@/lib/server/gradeAlerts";
import { alrKey, errorResponse } from "@/lib/server/subscription";

// The account's emailed grade alerts (opt-in). The address is the account email.

const SAVE_LIMIT = 30; // saves per user...
const SAVE_WINDOW_SECONDS = 60 * 60; // ...per hour (a switch per click)

/** `{ alerts: { kinds } | null, email, available }`; the unsubscribe key and sent keys never leave the server. */
const view = (record: StoredAlerts | null) => (record ? { kinds: record.kinds } : null);

export function GET(req: Request) {
  return guarded(req, async () => {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const record = await auth.deps.store.kv.get<StoredAlerts>(alrKey(auth.user.id));
    return json({ alerts: view(record), email: auth.user.email, available: isEmailConfigured() });
  });
}

/** Body: `{ kinds: { opportunity, risk, absence, change } }`, all booleans; all false turns email off. */
export function PUT(req: Request) {
  return guarded(req, async () => {
    const m = await mutation(req, 2048);
    if (m instanceof Response) return m;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const locale = auth.deps.locale ?? "hu";
    if (!isEmailConfigured()) return errorResponse(locale, "email_not_configured", 503);
    if (!auth.user.emailVerifiedAt) return errorResponse(locale, "email_unverified", 403);
    const kinds = emailKindsFrom(m.body.kinds);
    if (!kinds) return errorResponse(locale, "bad_alert_kinds", 400);

    const kv = auth.deps.store.kv;
    if ((await kv.incr(`rl:alerts:${auth.user.id}`, SAVE_WINDOW_SECONDS)) > SAVE_LIMIT) {
      return errorResponse(locale, "alerts_rate_limited", 429);
    }
    const previous = await kv.get<StoredAlerts>(alrKey(auth.user.id));
    const next = await saveAlerts(kv, auth.user.id, previous, kinds);
    return json({ alerts: view(next), email: auth.user.email, available: true });
  });
}

export function DELETE(req: Request) {
  return guarded(req, async () => {
    const bad = checkOrigin(req);
    if (bad) return bad;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    await removeAlerts(auth.deps.store.kv, auth.user.id);
    return json({ ok: true });
  });
}
