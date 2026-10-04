import { publicAppUrl } from "@/lib/server/appUrl";
import { runDigest, type SendOutcome } from "@/lib/server/digest";
import { DIGEST_INDEX_KEY, errorResponse, requireKv, storageErrorResponse } from "@/lib/server/subscription";

// Daily digest run, called by Vercel Cron (vercel.json) with `Authorization: Bearer $CRON_SECRET`.
// Each subscription gets at most one digest per period, so extra runs are harmless.

export const maxDuration = 60;

const CONCURRENCY = 5;

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return errorResponse("Nincs jogosultság", 401);
  } else if (process.env.NODE_ENV === "production") {
    return errorResponse("A CRON_SECRET nincs beállítva", 503);
  }
  const kv = requireKv();
  if (kv instanceof Response) return kv;

  let tokens: string[];
  try {
    tokens = await kv.smembers(DIGEST_INDEX_KEY);
  } catch {
    return storageErrorResponse();
  }

  const now = new Date();
  const appUrl = publicAppUrl(req);
  const counts: Record<SendOutcome, number> = { sent: 0, skipped: 0, empty: 0, removed: 0, failed: 0 };
  for (let i = 0; i < tokens.length; i += CONCURRENCY) {
    const results = await Promise.allSettled(
      tokens.slice(i, i + CONCURRENCY).map((token) => runDigest(kv, token, now, appUrl))
    );
    for (const r of results) counts[r.status === "fulfilled" ? r.value : "failed"]++;
  }
  return Response.json({ total: tokens.length, ...counts });
}
