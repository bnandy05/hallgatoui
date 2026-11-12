import { createHash } from "node:crypto";
import type { Kv } from "@/lib/server/kv";
import { askJevRaw, JEV_MIN_CONFIDENCE, JEV_MODEL, type JevAnswer, type JevQuestion } from "@/lib/server/jev";

// Jev for suggestions, asked as rarely as possible: every answer (confident or not) is cached
// for everyone under a hash of the question, which holds no ids or personal data, so a question
// any student already asked costs nothing. Only questions Jev actually gets count against the
// user's daily allowance. Server-only.

export const SUGGEST_DAILY_LIMIT = 150;
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

interface CachedAnswer {
  o: string;
  c: number;
}

export function questionCacheKey(q: JevQuestion): string {
  const canonical = JSON.stringify([JEV_MODEL, q.quote, q.instructions, q.options.map((o) => [o.id, o.criterion])]);
  return `jevc:${createHash("sha256").update(canonical).digest("hex").slice(0, 40)}`;
}

/**
 * Confident answers by question id. `limited` is true when the daily allowance left some
 * questions unasked (they get no answer; the client keeps its own default).
 */
export async function suggestWithJev(
  kv: Kv,
  userId: string,
  questions: JevQuestion[],
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ answers: Record<string, JevAnswer>; limited: boolean }> {
  const answers: Record<string, JevAnswer> = {};
  const uncached: JevQuestion[] = [];
  for (const q of questions) {
    const hit = await kv.get<CachedAnswer>(questionCacheKey(q));
    if (hit) answers[q.id] = { option: hit.o, confidence: hit.c };
    else uncached.push(q);
  }

  const allowed: JevQuestion[] = [];
  for (const q of uncached) {
    if ((await kv.incr(`rl:jev:d:${userId}`, 24 * 60 * 60)) > SUGGEST_DAILY_LIMIT) break;
    allowed.push(q);
  }
  if (allowed.length) {
    const fresh = await askJevRaw(allowed, apiKey, fetchImpl);
    for (const q of allowed) {
      const a = fresh[q.id];
      if (!a) continue; // failed: not cached, asked again next time
      answers[q.id] = a;
      await kv.set(questionCacheKey(q), { o: a.option, c: a.confidence } satisfies CachedAnswer, CACHE_TTL_SECONDS);
    }
  }
  const confident = Object.fromEntries(Object.entries(answers).filter(([, a]) => a.confidence >= JEV_MIN_CONFIDENCE));
  return { answers: confident, limited: allowed.length < uncached.length };
}
