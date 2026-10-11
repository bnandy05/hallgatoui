import { isAuthError, requestEmailChange } from "@/lib/server/auth/service";
import { authErrorResponse, checkOrigin, guarded, json, readJson, requireUser } from "@/lib/server/auth/http";

// PUT { email }: mails a confirmation link to the new address; the change happens on the link.
export function PUT(req: Request) {
  return guarded(req, async () => {
    const bad = checkOrigin(req);
    if (bad) return bad;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const body = await readJson(req, 4096);
    if (body instanceof Response) return body;
    const email = body && typeof body === "object" ? (body as { email?: unknown }).email : undefined;
    const result = await requestEmailChange(auth.deps, auth.user, email);
    return isAuthError(result) ? authErrorResponse(result, auth.deps.locale) : json({ ok: true });
  });
}
