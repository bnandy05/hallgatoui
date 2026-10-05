import { isAuthError, requestMagicLink } from "@/lib/server/auth/service";
import { authErrorResponse, guarded, json, mutation } from "@/lib/server/auth/http";

// Request a sign-in link by email (also the "resend confirmation" path for unconfirmed users).
export function POST(req: Request) {
  return guarded(async () => {
    const m = await mutation(req);
    if (m instanceof Response) return m;
    const result = await requestMagicLink(m.deps, m.body.email);
    return isAuthError(result) ? authErrorResponse(result) : json({ ok: true });
  });
}
