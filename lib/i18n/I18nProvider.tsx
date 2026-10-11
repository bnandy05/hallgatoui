"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { getMessages, type Locale, type Messages } from "@/lib/i18n";

interface I18nValue {
  locale: Locale;
  t: Messages;
}

const I18nContext = createContext<I18nValue | null>(null);

/** Gets the request's locale from the root layout; a language switch refreshes the route, which passes the new one. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: getMessages(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useT/useLocale need an I18nProvider");
  return value;
}

/** The dictionary for the current language: `const t = useT(); t.nav.week`. */
export function useT(): Messages {
  return useI18n().t;
}

export function useLocale(): Locale {
  return useI18n().locale;
}
