import { isAuthError, requestPasswordReset } from "@/lib/server/auth/service";
import { authErrorResponse, guarded, json, mutation } from "@/lib/server/auth/http";

export function POST(req: Request) {
  return guarded(req, async () => {
    const m = await mutation(req);
    if (m instanceof Response) return m;
    const result = await requestPasswordReset(m.deps, m.body.email);
    return isAuthError(result) ? authErrorResponse(result, m.deps.locale) : json({ ok: true });
  });
}
