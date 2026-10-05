import { normalizeUniversity } from "@/lib/rules/shared";
import { guarded, json, mutation, requireUser } from "@/lib/server/auth/http";
import { uniKey } from "@/lib/server/ruleTemplates";
import { errorResponse } from "@/lib/server/subscription";

// The account's university: it scopes the shared rule templates (same subject code, different
// universities, different rules).

export function GET(req: Request) {
  return guarded(async () => {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    return json({ university: await auth.deps.store.kv.get<string>(uniKey(auth.user.id)) });
  });
}

/** Body: `{ university }` (a listed id or free text), or `{ university: null }` to clear it. */
export function PUT(req: Request) {
  return guarded(async () => {
    const m = await mutation(req, 1024);
    if (m instanceof Response) return m;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const kv = auth.deps.store.kv;
    if (m.body.university === null) {
      await kv.del(uniKey(auth.user.id));
      return json({ university: null });
    }
    const university = normalizeUniversity(m.body.university);
    if (!university) return errorResponse("Érvénytelen egyetem", 400);
    await kv.set(uniKey(auth.user.id), university);
    return json({ university });
  });
}
