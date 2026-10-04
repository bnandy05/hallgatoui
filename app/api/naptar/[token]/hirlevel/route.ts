import { isDigestFrequency, normalizeEmail } from "@/lib/digest";
import { publicAppUrl } from "@/lib/server/appUrl";
import { digestStatus, removeDigest, requestDigest, type StoredDigest } from "@/lib/server/digest";
import { isEmailConfigured } from "@/lib/server/email";
import {
  authorize,
  digKey,
  errorResponse,
  storageErrorResponse,
} from "@/lib/server/subscription";

// The email digest of one calendar subscription. Every method requires the subscription secret.

const MAX_BODY_BYTES = 2048;
const SAVE_LIMIT = 5; // saves (and so confirmation mails) per subscription...
const SAVE_WINDOW_SECONDS = 60 * 60; // ...per hour

export async function GET(req: Request, ctx: RouteContext<"/api/naptar/[token]/hirlevel">): Promise<Response> {
  const auth = await authorize(req, (await ctx.params).token);
  if (auth instanceof Response) return auth;
  try {
    const digest = await auth.kv.get<StoredDigest>(digKey(auth.token));
    return Response.json({ digest: digestStatus(digest), available: isEmailConfigured() });
  } catch {
    return storageErrorResponse();
  }
}

/** Body: `{ email, frequency }`. A new address gets a confirmation mail first. */
export async function PUT(req: Request, ctx: RouteContext<"/api/naptar/[token]/hirlevel">): Promise<Response> {
  const auth = await authorize(req, (await ctx.params).token);
  if (auth instanceof Response) return auth;
  const { kv, token } = auth;
  if (!isEmailConfigured()) return errorResponse("Az e-mail-küldés nincs beállítva a szerveren", 503);

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return errorResponse("Túl nagy kérés", 413);
    body = JSON.parse(text);
  } catch {
    return errorResponse("Hibás kérés", 400);
  }
  const { email: rawEmail, frequency } = (body ?? {}) as { email?: unknown; frequency?: unknown };
  const email = normalizeEmail(rawEmail);
  if (!email) return errorResponse("Érvénytelen e-mail-cím", 400);
  if (!isDigestFrequency(frequency)) return errorResponse("Érvénytelen gyakoriság", 400);

  try {
    const count = await kv.incr(`rl:digest:${token}`, SAVE_WINDOW_SECONDS);
    if (count > SAVE_LIMIT) return errorResponse("Túl sok módosítás, próbáld újra később", 429);
    const previous = await kv.get<StoredDigest>(digKey(token));
    const next = await requestDigest(kv, token, previous, email, frequency, publicAppUrl(req), new Date());
    if (!next) return errorResponse("A megerősítő levelet nem sikerült elküldeni", 502);
    return Response.json({ digest: digestStatus(next) });
  } catch {
    return storageErrorResponse();
  }
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/naptar/[token]/hirlevel">): Promise<Response> {
  const auth = await authorize(req, (await ctx.params).token);
  if (auth instanceof Response) return auth;
  try {
    await removeDigest(auth.kv, auth.token);
  } catch {
    return storageErrorResponse();
  }
  return Response.json({ ok: true });
}
