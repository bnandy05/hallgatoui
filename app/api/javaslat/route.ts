import { guarded, json, mutation, requireUser } from "@/lib/server/auth/http";
import { isJevConfigured } from "@/lib/server/jev";
import { suggestWithJev } from "@/lib/server/jevSuggest";
import { errorResponse } from "@/lib/server/subscription";
import {
  courseQuestion,
  duplicateQuestion,
  MAX_SUGGEST_COURSES,
  MAX_SUGGEST_ITEMS,
  NONE_OPTION,
  type DuplicateSide,
} from "@/lib/suggest/questions";

// Jev's suggestions for what the local rules could not settle: which course a subject name
// belongs to (Neptun mapping, Canvas discovery) and whether two deadlines are one item. The
// client sends only names and titles, never ids; answers are cached for everyone (see
// lib/server/jevSuggest.ts). Answers below the confidence threshold are left out.
//
// Body: { kind: "course", names: string[], courses: string[] }
//    → { answers: ({ course: number | null, confidence } | null)[], limited }
// Body: { kind: "duplicate", pairs: { a: DuplicateSide, b: DuplicateSide }[] }
//    → { answers: ({ same: boolean, confidence } | null)[], limited }

export const maxDuration = 30;

const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "" && v.length <= 500;
const isSide = (v: unknown): v is DuplicateSide =>
  !!v && typeof v === "object" && ["title", "source", "time"].every((k) => isText((v as Record<string, unknown>)[k]));

export function GET() {
  return json({ enabled: isJevConfigured() });
}

export function POST(req: Request) {
  return guarded(async () => {
    const m = await mutation(req, 64 * 1024);
    if (m instanceof Response) return m;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const apiKey = process.env.JEV_API_KEY;
    if (!apiKey) return errorResponse("A javaslatok nincsenek beállítva a szerveren", 503);
    if (!auth.user.emailVerifiedAt) return errorResponse("Előbb erősítsd meg az e-mail-címed", 403);
    const kv = auth.deps.store.kv;
    const body = m.body as Record<string, unknown>;

    if (body.kind === "course") {
      const { names, courses } = body;
      if (!Array.isArray(names) || !names.every(isText) || names.length === 0 || names.length > MAX_SUGGEST_ITEMS) {
        return errorResponse("Hibás tárgynevek", 400);
      }
      if (!Array.isArray(courses) || !courses.every(isText) || courses.length === 0 || courses.length > MAX_SUGGEST_COURSES) {
        return errorResponse("Hibás tárgylista", 400);
      }
      const questions = names.map((n, i) => courseQuestion(String(i), n, courses));
      const { answers, limited } = await suggestWithJev(kv, auth.user.id, questions, apiKey);
      return json({
        answers: names.map((_, i) => {
          const a = answers[String(i)];
          if (!a) return null;
          return { course: a.option === NONE_OPTION ? null : Number(a.option.slice(1)), confidence: a.confidence };
        }),
        limited,
      });
    }

    if (body.kind === "duplicate") {
      const { pairs } = body;
      if (
        !Array.isArray(pairs) ||
        pairs.length === 0 ||
        pairs.length > MAX_SUGGEST_ITEMS ||
        !pairs.every((p) => !!p && isSide(p.a) && isSide(p.b))
      ) {
        return errorResponse("Hibás párok", 400);
      }
      const questions = (pairs as { a: DuplicateSide; b: DuplicateSide }[]).map((p, i) => duplicateQuestion(String(i), p.a, p.b));
      const { answers, limited } = await suggestWithJev(kv, auth.user.id, questions, apiKey);
      return json({
        answers: pairs.map((_, i) => {
          const a = answers[String(i)];
          return a ? { same: a.option === "same", confidence: a.confidence } : null;
        }),
        limited,
      });
    }

    return errorResponse("Ismeretlen kérés", 400);
  });
}
