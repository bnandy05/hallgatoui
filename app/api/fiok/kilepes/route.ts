import { logout } from "@/lib/server/auth/service";
import { authDeps, checkOrigin, clearedSessionCookie, guarded, json, sessionTokenOf } from "@/lib/server/auth/http";

// Signs out this session, or every session with ?mindenhol=1.
export function POST(req: Request) {
  return guarded(req, async () => {
    const bad = checkOrigin(req);
    if (bad) return bad;
    const deps = authDeps(req);
    if (deps instanceof Response) return deps;
    const token = sessionTokenOf(req);
    if (token) await logout(deps, token, new URL(req.url).searchParams.get("mindenhol") === "1");
    return json({ ok: true }, clearedSessionCookie());
  });
}
