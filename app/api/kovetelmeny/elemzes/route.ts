import { createHash } from "node:crypto";
import { MAX_EXTRACT_CHARS } from "@/lib/rules/extract";
import { buildSurveyRequest, FIELD_IDS, readSurvey } from "@/lib/rules/extract/survey";
import { guarded, json, mutation, requireUser } from "@/lib/server/auth/http";
import { isJevConfigured, systemOne } from "@/lib/server/jev";
import { errorResponse } from "@/lib/server/subscription";

// The requirements survey: Jev reads the whole pasted document once, 24 typed questions in
// parallel (lib/rules/extract/survey), and code reads the answers (gates, review flags). The text
// is never stored or logged: it lives for one request. Jev's raw answers (labels, confidences and
// choices among numbers, no text) are cached for everyone under a hash of the request, so the
// same document and course cost nothing the second time. The browser shows every flagged field
// for the student to confirm.

export const maxDuration = 60;

const HOURLY_LIMIT = 10;
const DAILY_LIMIT = 30;
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_COURSE_NAME = 200;
const MAX_COURSE_CODE = 50;

export function GET() {
  return json({ enabled: isJevConfigured() });
}

/** Body: `{ text, course: { name, code? } }`. Returns `{ survey, truncated }`. */
export function POST(req: Request) {
  return guarded(async () => {
    const m = await mutation(req, MAX_EXTRACT_CHARS * 4);
    if (m instanceof Response) return m;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const apiKey = process.env.JEV_API_KEY;
    if (!apiKey) return errorResponse("Az automatikus értelmezés nincs beállítva a szerveren", 503);
    if (!auth.user.emailVerifiedAt) return errorResponse("Előbb erősítsd meg az e-mail-címed", 403);
    const { text, course } = m.body;
    if (typeof text !== "string" || text.trim() === "") return errorResponse("Hiányzik a szöveg", 400);
    if (text.length > MAX_EXTRACT_CHARS) return errorResponse("Túl hosszú szöveg", 413);
    if (typeof course !== "object" || course === null || Array.isArray(course)) return errorResponse("Hiányzik a tárgy", 400);
    const { name, code } = course as { name?: unknown; code?: unknown };
    if (typeof name !== "string" || name.trim() === "" || name.length > MAX_COURSE_NAME) return errorResponse("Érvénytelen tárgynév", 400);
    if (code !== undefined && (typeof code !== "string" || code.length > MAX_COURSE_CODE)) return errorResponse("Érvénytelen tárgykód", 400);

    const kv = auth.deps.store.kv;
    const { body, candidates, truncated } = buildSurveyRequest(text, { name: name.trim(), ...(code ? { code } : {}) });
    const key = `jevs:${createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 40)}`;
    const cached = await kv.get<unknown>(key);
    if (cached) return json({ survey: readSurvey(cached, candidates), truncated });

    // Only real calls count, before the call, so a timeout still counts.
    if (
      (await kv.incr(`rl:kov:h:${auth.user.id}`, 60 * 60)) > HOURLY_LIMIT ||
      (await kv.incr(`rl:kov:d:${auth.user.id}`, 24 * 60 * 60)) > DAILY_LIMIT
    ) {
      return errorResponse("Túl sok elemzés, próbáld újra később", 429);
    }
    const answers = await systemOne(body, apiKey);
    if (!answers) return errorResponse("A Jev most nem válaszolt, próbáld újra később", 502);
    const survey = readSurvey(answers, candidates);
    // A partial answer set is shown (the gaps are flagged) but not cached, so the next try asks again.
    if (Object.keys(survey.raw).length === FIELD_IDS.length) await kv.set(key, answers, CACHE_TTL_SECONDS);
    return json({ survey, truncated });
  });
}
