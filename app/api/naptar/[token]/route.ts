import { requestLocale } from "@/lib/server/locale";
import { getAccountStore } from "@/lib/server/account/store";
import { publicAppUrl } from "@/lib/server/appUrl";
import { renderCalendar } from "@/lib/server/calendar";
import {
  errorResponse,
  parseToken,
  storageErrorResponse,
  subKey,
} from "@/lib/server/subscription";

/** Public read: the account's combined calendar, addressed by the token (optionally with a .ics suffix). */
export async function GET(req: Request, ctx: RouteContext<"/api/naptar/[token]">): Promise<Response> {
  const locale = requestLocale(req);
  const store = getAccountStore();
  if (!store) return errorResponse(locale, "not_configured", 503);

  const token = parseToken((await ctx.params).token);
  if (!token) return errorResponse(locale, "unknown_calendar", 404);

  try {
    const sub = await store.kv.get<{ userId: string }>(subKey(token));
    if (!sub) return errorResponse(locale, "unknown_calendar", 404);

    const ics = await renderCalendar(
      store,
      sub.userId,
      new Date(),
      publicAppUrl(req),
      new URL(req.url).searchParams.get("nezet")
    );
    if (ics === null) return errorResponse(locale, "unknown_calendar", 404);
    return new Response(ics, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "cache-control": "no-cache",
        "content-disposition": 'inline; filename="hallgatoi-reteg.ics"',
      },
    });
  } catch {
    return storageErrorResponse(locale);
  }
}
