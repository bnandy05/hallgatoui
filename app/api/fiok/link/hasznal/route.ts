import { consumeLink, isAuthError, type LinkKind } from "@/lib/server/auth/service";
import { authErrorResponse, guarded, json, mutation, sessionCookie } from "@/lib/server/auth/http";
import { localeCookie } from "@/lib/server/locale";
import { errorResponse } from "@/lib/server/subscription";

const KINDS: LinkKind[] = ["megerosites", "belepes", "jelszo", "email"];

// Consumes an emailed link. Only this POST uses a token up; the /fiok/link page never does.
export function POST(req: Request) {
  return guarded(req, async () => {
    const m = await mutation(req);
    if (m instanceof Response) return m;
    const { m: kind, t, password } = m.body;
    if (typeof kind !== "string" || !KINDS.includes(kind as LinkKind) || typeof t !== "string") {
      return errorResponse(m.deps.locale ?? "hu", "link_expired", 400);
    }
    const result = await consumeLink(
      m.deps,
      kind as LinkKind,
      t,
      typeof password === "string" ? password : undefined,
      req.headers.get("user-agent") ?? undefined
    );
    if (isAuthError(result)) return authErrorResponse(result, m.deps.locale);
    return result.sessionToken
      ? json({ ok: true }, [sessionCookie(result.sessionToken), localeCookie(result.locale)])
      : json({ ok: true });
  });
}
