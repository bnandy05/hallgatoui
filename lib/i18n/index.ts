// Pure helpers over the dictionaries (no React, no cookies), importable from tests.

import { enGB, hu as huDateLocale } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";
import { hu } from "./hu";
import { en } from "./en";
import type { Locale } from "./locales";

export * from "./locales";

type DeepWiden<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => R
    : { [K in keyof T]: DeepWiden<T[K]> };

/** The shape every dictionary must have; Hungarian is the source. */
export type Messages = DeepWiden<typeof hu>;

const MESSAGES: Record<Locale, Messages> = { hu, en };

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}

/** date-fns locale for the UI language (en-GB: Monday weeks, 24 h, day-month order). */
export function dateLocale(locale: Locale): DateFnsLocale {
  return locale === "hu" ? huDateLocale : enGB;
}

export { plural } from "./plural";
