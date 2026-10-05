import { isAuthError, login } from "@/lib/server/auth/service";
import { authErrorResponse, guarded, json, mutation, sessionCookie } from "@/lib/server/auth/http";

export function POST(req: Request) {
  return guarded(async () => {
    const m = await mutation(req);
    if (m instanceof Response) return m;
    const result = await login(m.deps, m.body.email, m.body.password, req.headers.get("user-agent") ?? undefined);
    return isAuthError(result) ? authErrorResponse(result) : json({ ok: true }, sessionCookie(result.sessionToken));
  });
}
