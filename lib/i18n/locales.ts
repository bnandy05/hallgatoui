// Locale model: pure, shared by the proxy (edge), server and client. No React, no date-fns.

export type Locale = "hu" | "en";

export const LOCALES: readonly Locale[] = ["hu", "en"];
export const DEFAULT_LOCALE: Locale = "en";

/** Not httpOnly: the client reads and writes it when the language is switched. */
export const LOCALE_COOKIE = "hr_lang";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return value === "hu" || value === "en";
}

/**
 * Locale from an Accept-Language header: Hungarian only when the highest-ranked language is
 * `hu` or `hu-*` (a tie goes to the one listed first), English otherwise, including for a
 * missing or malformed header.
 */
export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  let bestTag = "";
  let bestQ = 0;
  for (const part of acceptLanguage.split(",")) {
    const [rawTag, ...params] = part.split(";");
    const tag = rawTag.trim().toLowerCase();
    if (!tag) continue;
    let q = 1;
    for (const param of params) {
      const m = /^\s*q\s*=\s*(\d+(?:\.\d+)?|\.\d+)\s*$/i.exec(param);
      if (m) q = Number(m[1]);
      else if (/^\s*q\s*=/i.test(param)) q = 0; // malformed weight: ignore this language
    }
    if (q > bestQ) {
      bestQ = q;
      bestTag = tag;
    }
  }
  return bestTag === "hu" || bestTag.startsWith("hu-") ? "hu" : DEFAULT_LOCALE;
}
