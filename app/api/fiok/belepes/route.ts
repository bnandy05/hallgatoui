import { isAuthError, login } from "@/lib/server/auth/service";
import { authErrorResponse, guarded, json, mutation, sessionCookie } from "@/lib/server/auth/http";
import { localeCookie } from "@/lib/server/locale";

export function POST(req: Request) {
  return guarded(req, async () => {
    const m = await mutation(req);
    if (m instanceof Response) return m;
    const result = await login(m.deps, m.body.email, m.body.password, req.headers.get("user-agent") ?? undefined);
    return isAuthError(result)
      ? authErrorResponse(result, m.deps.locale)
      : json({ ok: true }, [sessionCookie(result.sessionToken), localeCookie(result.locale)]);
  });
}
