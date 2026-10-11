import { isLocale } from "@/lib/i18n";
import { setAccountLocale } from "@/lib/server/auth/service";
import { guarded, json, mutation, requireUser } from "@/lib/server/auth/http";
import { localeCookie } from "@/lib/server/locale";
import { errorResponse } from "@/lib/server/subscription";

// PUT { locale }: the user's own choice of language. It is stored on the account (so mails, the
// subscribed calendar and every device follow) and also set as this browser's cookie.
export function PUT(req: Request) {
  return guarded(req, async () => {
    const m = await mutation(req, 1024);
    if (m instanceof Response) return m;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { locale } = m.body;
    if (!isLocale(locale)) return errorResponse(auth.deps.locale ?? "hu", "bad_language", 400);
    await setAccountLocale(auth.deps, auth.user, locale);
    return json({ ok: true, locale }, localeCookie(locale));
  });
}
