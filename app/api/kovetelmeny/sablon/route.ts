import { parseCourseCodes, requirementCourseCode } from "@/lib/rules/courseCode";
import { normalizeSemester, normalizeSubjectCode, type SharedRequirementOptions } from "@/lib/rules/shared";
import { guarded, json, mutation, requireUser } from "@/lib/server/auth/http";
import { confirmTemplate, findTemplates, reportTemplate, uniKey, recordTemplateUse } from "@/lib/server/ruleTemplates";
import { errorResponse } from "@/lib/server/subscription";

const DAILY_WRITES = 30;

export function GET(req: Request) {
  return guarded(req, async () => {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const kv = auth.deps.store.kv;
    const university = await kv.get<string>(uniKey(auth.user.id));
    const params = new URL(req.url).searchParams;
    const rawCodes = params.getAll("kod").slice(0, 20);
    const normalized = [...new Set(rawCodes.flatMap((raw) => parseCourseCodes(raw).map((c) => c.code)))];
    const result: SharedRequirementOptions = { university, offers: [] };
    if (university && normalized.length) {
      // Older shares could include a Canvas section number in the normalized code.
      const legacy = rawCodes.filter((raw) => requirementCourseCode(raw)).map(normalizeSubjectCode).filter((s): s is string => !!s);
      const codes = [...new Set([...normalized, ...legacy])].slice(0, 40);
      const now = new Date();
      const semester = normalizeSemester(params.get("felev"), now);
      result.offers = await findTemplates(kv, auth.user.id, university, codes, semester, normalizeSemester(undefined, now));
    }
    return json(result);
  });
}

export function POST(req: Request) {
  return guarded(req, async () => {
    const m = await mutation(req, 64 * 1024);
    if (m instanceof Response) return m;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const locale = auth.deps.locale ?? "hu";
    if (!auth.user.emailVerifiedAt) return errorResponse(locale, "email_unverified", 403);
    const kv = auth.deps.store.kv;
    const university = await kv.get<string>(uniKey(auth.user.id));
    if (!university) return errorResponse(locale, "university_required", 400);
    const codes = parseCourseCodes(typeof m.body.kod === "string" ? m.body.kod : undefined).map((c) => c.code);
    const code = codes[0];
    if (!code || codes.length > 20) return errorResponse(locale, "bad_subject_code", 400);
    const now = new Date();
    const semester = normalizeSemester(m.body.felev, now);
    if ((await kv.incr(`rl:tpl:${auth.user.id}`, 24 * 60 * 60)) > DAILY_WRITES) {
      return errorResponse(locale, "template_rate_limited", 429);
    }
    const { hibas, variantId } = m.body;
    if (typeof hibas === "string" || typeof variantId === "string") {
      const ok = typeof hibas === "string"
        ? await reportTemplate(kv, auth.user.id, university, code, semester, hibas)
        : typeof variantId === "string" && await recordTemplateUse(kv, auth.user.id, university, code, semester, variantId, now);
      return ok ? json({ ok: true }) : errorResponse(locale, "template_not_found", 404);
    }
    for (const alias of [...new Set(codes)]) {
      const error = await confirmTemplate(kv, auth.user.id, university, alias, semester, m.body.rules, now);
      if (error) return errorResponse(locale, error, 400);
    }
    return json({ ok: true });
  });
}
