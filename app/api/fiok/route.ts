import { deleteAccount, isAuthError } from "@/lib/server/auth/service";
import {
  authErrorResponse,
  checkOrigin,
  clearedSessionCookie,
  guarded,
  json,
  readJson,
  requireUser,
} from "@/lib/server/auth/http";

// GET: the signed-in user. DELETE: delete the account (body { email } confirms it).

export function GET(req: Request) {
  return guarded(req, async () => {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { user } = auth;
    return json({ user: { id: user.id, email: user.email, hasPassword: !!user.passwordHash } });
  });
}

export function DELETE(req: Request) {
  return guarded(req, async () => {
    const bad = checkOrigin(req);
    if (bad) return bad;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const body = await readJson(req, 4096);
    if (body instanceof Response) return body;
    const email = body && typeof body === "object" ? (body as { email?: unknown }).email : undefined;
    const result = await deleteAccount(auth.deps, auth.user, email);
    return isAuthError(result) ? authErrorResponse(result, auth.deps.locale) : json({ ok: true }, clearedSessionCookie());
  });
}
