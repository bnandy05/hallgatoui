import { getMessages, isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, pickLocale, type Locale, type Messages } from "@/lib/i18n";
import type { StoredUser } from "@/lib/server/account/store";

// The language of a server response. A signed-in user's own choice (account locale) wins for
// everything addressed to them; otherwise the request's hr_lang cookie, else Accept-Language.
// Server-only, but free of next/* so tests can import it.

function cookieValue(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

/** The request's language: the hr_lang cookie, else the browser's Accept-Language. */
export function requestLocale(req: Request): Locale {
  const cookie = cookieValue(req, LOCALE_COOKIE);
  return isLocale(cookie) ? cookie : pickLocale(req.headers.get("accept-language"));
}

/** The account's language; accounts created before the setting default to Hungarian. */
export function userLocale(user: Pick<StoredUser, "locale"> | null | undefined): Locale {
  return isLocale(user?.locale) ? user.locale : "hu";
}

export const messagesFor = (locale: Locale): Messages => getMessages(locale);

/** Set-Cookie value for the language cookie (readable by the client, like the one the proxy sets). */
export function localeCookie(locale: Locale): string {
  return `${LOCALE_COOKIE}=${locale}; SameSite=Lax; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
