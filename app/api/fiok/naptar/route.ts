import type { Kv } from "@/lib/server/kv";
import { checkOrigin, guarded, json, requireUser } from "@/lib/server/auth/http";
import { generateCalendarToken, icsIndexKey, subKey } from "@/lib/server/subscription";

// The account's calendar subscription. GET: { token | null }. POST: create (no-op when there is
// one); ?uj=1 rotates the token. DELETE: turn it off. The public .ics is /api/naptar/[token].

async function dropRendered(kv: Kv, userId: string) {
  const keys = await kv.smembers(icsIndexKey(userId));
  if (keys.length > 0) await kv.del(...keys);
  for (const key of keys) await kv.srem(icsIndexKey(userId), key);
}

export function GET(req: Request) {
  return guarded(async () => {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const fresh = await auth.deps.store.getUser(auth.user.id);
    return json({ token: fresh?.calendarToken ?? null });
  });
}

export function POST(req: Request) {
  return guarded(async () => {
    const bad = checkOrigin(req);
    if (bad) return bad;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { store } = auth.deps;
    const user = (await store.getUser(auth.user.id)) ?? auth.user;
    const rotate = new URL(req.url).searchParams.get("uj") === "1";
    if (user.calendarToken && !rotate) return json({ token: user.calendarToken });

    const token = generateCalendarToken();
    await store.kv.set(subKey(token), { userId: user.id });
    await store.putUser({ ...user, calendarToken: token });
    if (user.calendarToken) await store.kv.del(subKey(user.calendarToken));
    return json({ token });
  });
}

export function DELETE(req: Request) {
  return guarded(async () => {
    const bad = checkOrigin(req);
    if (bad) return bad;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { store } = auth.deps;
    const user = (await store.getUser(auth.user.id)) ?? auth.user;
    if (user.calendarToken) {
      await store.kv.del(subKey(user.calendarToken));
      await store.putUser({ ...user, calendarToken: undefined });
    }
    await dropRendered(store.kv, user.id);
    return json({ ok: true });
  });
}
