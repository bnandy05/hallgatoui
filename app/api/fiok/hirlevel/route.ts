import { isDigestFrequency } from "@/lib/digest";
import { digestStatus, removeDigest, saveDigest, type StoredDigest } from "@/lib/server/digest";
import { isEmailConfigured } from "@/lib/server/email";
import { checkOrigin, guarded, json, mutation, requireUser } from "@/lib/server/auth/http";
import { digKey, errorResponse } from "@/lib/server/subscription";

// The account's email digest. The address is the account email, so there is nothing to confirm.

const SAVE_LIMIT = 5; // saves per user...
const SAVE_WINDOW_SECONDS = 60 * 60; // ...per hour

export function GET(req: Request) {
  return guarded(req, async () => {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const digest = await auth.deps.store.kv.get<StoredDigest>(digKey(auth.user.id));
    return json({ digest: digestStatus(digest), email: auth.user.email, available: isEmailConfigured() });
  });
}

/** Body: `{ frequency }`. */
export function PUT(req: Request) {
  return guarded(req, async () => {
    const m = await mutation(req, 2048);
    if (m instanceof Response) return m;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    if (!isEmailConfigured()) return errorResponse(auth.deps.locale ?? "hu", "email_not_configured", 503);
    const { frequency } = m.body;
    if (!isDigestFrequency(frequency)) return errorResponse(auth.deps.locale ?? "hu", "bad_frequency", 400);

    const kv = auth.deps.store.kv;
    if ((await kv.incr(`rl:digest:${auth.user.id}`, SAVE_WINDOW_SECONDS)) > SAVE_LIMIT) {
      return errorResponse(auth.deps.locale ?? "hu", "digest_rate_limited", 429);
    }
    const previous = await kv.get<StoredDigest>(digKey(auth.user.id));
    const next = await saveDigest(kv, auth.user.id, previous, frequency, new Date());
    return json({ digest: digestStatus(next), email: auth.user.email, available: true });
  });
}

export function DELETE(req: Request) {
  return guarded(req, async () => {
    const bad = checkOrigin(req);
    if (bad) return bad;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    await removeDigest(auth.deps.store.kv, auth.user.id);
    return json({ ok: true });
  });
}
