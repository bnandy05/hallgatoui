import { isAuthError, register } from "@/lib/server/auth/service";
import { authErrorResponse, guarded, json, mutation } from "@/lib/server/auth/http";

export function POST(req: Request) {
  return guarded(req, async () => {
    const m = await mutation(req);
    if (m instanceof Response) return m;
    const result = await register(m.deps, m.body.email, m.body.password);
    return isAuthError(result) ? authErrorResponse(result, m.deps.locale) : json({ ok: true });
  });
}
