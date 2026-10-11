import { getMessages, isLocale, LOCALE_COOKIE, pickLocale, type Locale, type Messages } from "@/lib/i18n";

// The browser's current language outside React (fetch wrappers, the sync engine): the hr_lang
// cookie, which the proxy and a language switch keep up to date. Browser-only.

export function currentLocale(): Locale {
  if (typeof document === "undefined") return "hu";
  for (const part of document.cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LOCALE_COOKIE && isLocale(rest.join("="))) return rest.join("=") as Locale;
  }
  return pickLocale(typeof navigator === "undefined" ? null : navigator.language);
}

export const currentMessages = (): Messages => getMessages(currentLocale());
