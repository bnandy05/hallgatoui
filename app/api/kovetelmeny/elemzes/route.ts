import { extractRules, MAX_EXTRACT_CHARS } from "@/lib/rules/extract";
import { guarded, json, mutation, requireUser } from "@/lib/server/auth/http";
import { isJevConfigured, JEV_MAX_QUESTIONS, type JevAnswer } from "@/lib/server/jev";
import { suggestWithJev } from "@/lib/server/jevSuggest";
import { errorResponse } from "@/lib/server/subscription";

// Jev's answers to the questions the rule extraction leaves open. The parser runs in the browser
// too; here it runs again on the same text so the questions sent to Jev are the server's own,
// never the client's. Nothing is stored or logged: the text lives for one request, and Jev only
// gets the sentences the questions are about. Answers can open new questions (the guided
// reading asks "how many" only after "is there"), so Jev gets up to three rounds. Its answers
// are cached for everyone under a hash of the question, like the other suggestions.

export const maxDuration = 60;
const MAX_ROUNDS = 3;
const ROUND_BUDGET_MS = 35_000;

const HOURLY_LIMIT = 10;
const DAILY_LIMIT = 30;

export function GET() {
  return json({ enabled: isJevConfigured() });
}

/** Body: `{ text }`. Returns `{ answers: { [questionId]: { option, confidence } } }`. */
export function POST(req: Request) {
  return guarded(async () => {
    const m = await mutation(req, MAX_EXTRACT_CHARS * 4);
    if (m instanceof Response) return m;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const apiKey = process.env.JEV_API_KEY;
    if (!apiKey) return errorResponse("Az automatikus értelmezés nincs beállítva a szerveren", 503);
    if (!auth.user.emailVerifiedAt) return errorResponse("Előbb erősítsd meg az e-mail-címed", 403);
    const { text } = m.body;
    if (typeof text !== "string" || text.trim() === "") return errorResponse("Hiányzik a szöveg", 400);
    if (text.length > MAX_EXTRACT_CHARS) return errorResponse("Túl hosszú szöveg", 413);

    const kv = auth.deps.store.kv;
    // Counted before the call, so a timeout still counts.
    if (
      (await kv.incr(`rl:kov:h:${auth.user.id}`, 60 * 60)) > HOURLY_LIMIT ||
      (await kv.incr(`rl:kov:d:${auth.user.id}`, 24 * 60 * 60)) > DAILY_LIMIT
    ) {
      return errorResponse("Túl sok elemzés, próbáld újra később", 429);
    }
    const started = Date.now();
    const answers: Record<string, JevAnswer> = {};
    const asked = new Set<string>();
    for (let round = 0; round < MAX_ROUNDS && Date.now() - started < ROUND_BUDGET_MS; round++) {
      const chosen = Object.fromEntries(Object.entries(answers).map(([id, a]) => [id, a.option]));
      const fresh = extractRules(text, chosen).questions.filter((q) => !asked.has(q.id));
      if (fresh.length === 0) break;
      for (const q of fresh) asked.add(q.id);
      // Jev takes at most JEV_MAX_QUESTIONS per call.
      for (let i = 0; i < fresh.length; i += JEV_MAX_QUESTIONS) {
        const got = await suggestWithJev(kv, auth.user.id, fresh.slice(i, i + JEV_MAX_QUESTIONS), apiKey);
        Object.assign(answers, got.answers);
        if (got.limited) return json({ answers });
      }
    }
    return json({ answers });
  });
}
