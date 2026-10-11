import { changePassword, isAuthError } from "@/lib/server/auth/service";
import { authErrorResponse, checkOrigin, guarded, json, readJson, requireUser } from "@/lib/server/auth/http";

// PUT { current?, next }: sets or changes the password and ends the other sessions.
export function PUT(req: Request) {
  return guarded(req, async () => {
    const bad = checkOrigin(req);
    if (bad) return bad;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const body = await readJson(req, 4096);
    if (body instanceof Response) return body;
    const { current, next } = (body && typeof body === "object" ? body : {}) as { current?: unknown; next?: unknown };
    const result = await changePassword(auth.deps, auth.user, current, next, auth.sessionToken);
    return isAuthError(result) ? authErrorResponse(result, auth.deps.locale) : json({ ok: true });
  });
}
