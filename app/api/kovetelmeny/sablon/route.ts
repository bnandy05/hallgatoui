import { normalizeSemester, normalizeSubjectCode } from "@/lib/rules/shared";
import { guarded, json, mutation, requireUser } from "@/lib/server/auth/http";
import { confirmTemplate, findTemplate, reportTemplate, uniKey } from "@/lib/server/ruleTemplates";
import { errorResponse } from "@/lib/server/subscription";

// Shared rule templates for the account's university: look one up before extracting, confirm
// (publish) after the student saved reviewed rules, or report a faulty one.

const DAILY_WRITES = 30;

/** Query: `kod` (subject code), `felev` (optional term text). Returns `{ university, template }`. */
export function GET(req: Request) {
  return guarded(async () => {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const kv = auth.deps.store.kv;
    const university = await kv.get<string>(uniKey(auth.user.id));
    const params = new URL(req.url).searchParams;
    const code = normalizeSubjectCode(params.get("kod"));
    if (!university || !code) return json({ university, template: null });
    const semester = normalizeSemester(params.get("felev"), new Date());
    return json({ university, template: await findTemplate(kv, auth.user.id, university, code, semester) });
  });
}

/** Body: `{ kod, felev?, rules }` to confirm, or `{ kod, felev, hibas: variantId }` to report. */
export function POST(req: Request) {
  return guarded(async () => {
    const m = await mutation(req, 64 * 1024);
    if (m instanceof Response) return m;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    if (!auth.user.emailVerifiedAt) return errorResponse("Előbb erősítsd meg az e-mail-címed", 403);
    const kv = auth.deps.store.kv;
    const university = await kv.get<string>(uniKey(auth.user.id));
    if (!university) return errorResponse("Előbb állítsd be az egyetemed", 400);
    const code = normalizeSubjectCode(m.body.kod);
    if (!code) return errorResponse("Érvénytelen tárgykód", 400);
    const semester = normalizeSemester(m.body.felev, new Date());
    if ((await kv.incr(`rl:tpl:${auth.user.id}`, 24 * 60 * 60)) > DAILY_WRITES) {
      return errorResponse("Túl sok módosítás, próbáld újra később", 429);
    }
    if (typeof m.body.hibas === "string") {
      const ok = await reportTemplate(kv, auth.user.id, university, code, semester, m.body.hibas);
      return ok ? json({ ok: true }) : errorResponse("Nincs ilyen sablon", 404);
    }
    const error = await confirmTemplate(kv, auth.user.id, university, code, semester, m.body.rules, new Date());
    return error ? errorResponse(error, 400) : json({ ok: true });
  });
}
