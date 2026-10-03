import type { Kv } from "@/lib/server/kv";
import { renderSubscription } from "@/lib/server/calendar";
import {
  bearerSecret,
  errorResponse,
  parseToken,
  readSnapshotBody,
  requireKv,
  srcKey,
  storageErrorResponse,
  subKey,
  TTL_SECONDS,
  verifySecret,
  type StoredSubscription,
} from "@/lib/server/subscription";

const NOT_FOUND = "Ismeretlen naptár";

/** Public read: the combined calendar, addressed by the token (optionally with a .ics suffix). */
export async function GET(req: Request, ctx: RouteContext<"/api/naptar/[token]">): Promise<Response> {
  const kv = requireKv();
  if (kv instanceof Response) return kv;

  const token = parseToken((await ctx.params).token);
  if (!token) return errorResponse(NOT_FOUND, 404);

  let sub: StoredSubscription | null;
  try {
    sub = await kv.get<StoredSubscription>(subKey(token));
  } catch {
    return storageErrorResponse();
  }
  if (!sub) return errorResponse(NOT_FOUND, 404);

  const url = new URL(req.url);
  const ics = await renderSubscription(
    kv,
    token,
    sub,
    new Date(),
    url.origin,
    url.searchParams.get("nezet")
  );
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "no-cache",
      "content-disposition": 'inline; filename="hallgatoi-reteg.ics"',
    },
  });
}

/** Loads the subscription and checks the Bearer secret; returns an error response otherwise. */
async function authorize(
  req: Request,
  rawToken: string
): Promise<{ kv: Kv; token: string; sub: StoredSubscription } | Response> {
  const kv = requireKv();
  if (kv instanceof Response) return kv;

  const token = parseToken(rawToken);
  if (!token) return errorResponse(NOT_FOUND, 404);

  let sub: StoredSubscription | null;
  try {
    sub = await kv.get<StoredSubscription>(subKey(token));
  } catch {
    return storageErrorResponse();
  }
  if (!sub) return errorResponse(NOT_FOUND, 404);

  const secret = bearerSecret(req);
  if (!secret || !verifySecret(secret, sub.secretHash)) {
    return errorResponse("Hibás vagy hiányzó jogosultság", 401);
  }
  return { kv, token, sub };
}

/** Replaces the snapshot. Requires the secret. */
export async function PUT(req: Request, ctx: RouteContext<"/api/naptar/[token]">): Promise<Response> {
  const auth = await authorize(req, (await ctx.params).token);
  if (auth instanceof Response) return auth;
  const { kv, token, sub } = auth;

  const snapshot = await readSnapshotBody(req);
  if (snapshot instanceof Response) return snapshot;

  const stored: StoredSubscription = {
    secretHash: sub.secretHash,
    snapshot,
    updatedAt: new Date().toISOString(),
  };
  try {
    await kv.set(subKey(token), stored, TTL_SECONDS);
    // Source caches of removed feeds are no longer needed.
    const kept = new Set(snapshot.feeds.map((f) => f.id));
    const removed = sub.snapshot.feeds.filter((f) => !kept.has(f.id));
    await kv.del(...removed.map((f) => srcKey(token, f.id)));
  } catch {
    return storageErrorResponse();
  }
  return Response.json({ ok: true, updatedAt: stored.updatedAt });
}

/** Deletes the subscription and its source caches. Requires the secret. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/naptar/[token]">): Promise<Response> {
  const auth = await authorize(req, (await ctx.params).token);
  if (auth instanceof Response) return auth;
  const { kv, token, sub } = auth;

  try {
    await kv.del(subKey(token), ...sub.snapshot.feeds.map((f) => srcKey(token, f.id)));
  } catch {
    return storageErrorResponse();
  }
  return Response.json({ ok: true });
}
