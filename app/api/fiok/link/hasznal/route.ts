import { consumeLink, isAuthError, type LinkKind } from "@/lib/server/auth/service";
import { authErrorResponse, guarded, json, mutation, sessionCookie } from "@/lib/server/auth/http";

const KINDS: LinkKind[] = ["megerosites", "belepes", "jelszo", "email"];

// Consumes an emailed link. Only this POST uses a token up; the /fiok/link page never does.
export function POST(req: Request) {
  return guarded(async () => {
    const m = await mutation(req);
    if (m instanceof Response) return m;
    const { m: kind, t, password } = m.body;
    if (typeof kind !== "string" || !KINDS.includes(kind as LinkKind) || typeof t !== "string") {
      return authErrorResponse({ error: "A link lejárt vagy már felhasználták", status: 400 });
    }
    const result = await consumeLink(
      m.deps,
      kind as LinkKind,
      t,
      typeof password === "string" ? password : undefined,
      req.headers.get("user-agent") ?? undefined
    );
    if (isAuthError(result)) return authErrorResponse(result);
    return result.sessionToken ? json({ ok: true }, sessionCookie(result.sessionToken)) : json({ ok: true });
  });
}
