import { isAuthError, requestPasswordReset } from "@/lib/server/auth/service";
import { authErrorResponse, guarded, json, mutation } from "@/lib/server/auth/http";

export function POST(req: Request) {
  return guarded(async () => {
    const m = await mutation(req);
    if (m instanceof Response) return m;
    const result = await requestPasswordReset(m.deps, m.body.email);
    return isAuthError(result) ? authErrorResponse(result) : json({ ok: true });
  });
}
