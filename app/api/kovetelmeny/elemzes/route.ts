import { extractRules, MAX_EXTRACT_CHARS } from "@/lib/rules/extract";
import { guarded, json, mutation, requireUser } from "@/lib/server/auth/http";
import { askJev, isJevConfigured } from "@/lib/server/jev";
import { errorResponse } from "@/lib/server/subscription";

// Jev's answers to the questions the rule extraction leaves open. The parser runs in the browser
// too; here it runs again on the same text so the questions sent to Jev are the server's own,
// never the client's. Nothing is stored or logged: the text lives for one request, and Jev only
// gets the sentences the questions are about.

export const maxDuration = 30;

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
    const { questions } = extractRules(text);
    const answers = questions.length ? await askJev(questions, apiKey) : {};
    return json({ answers });
  });
}
