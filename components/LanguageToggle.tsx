"use client";

import { LOCALES } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { useSetLanguage } from "@/lib/i18n/useSetLanguage";

/** Compact HU | EN switch for pages without the settings (sign-in). */
export function LanguageToggle() {
  const t = useT();
  const locale = useLocale();
  const setLanguage = useSetLanguage();
  return (
    <div role="group" aria-label={t.language.label} className="inline-flex gap-0.5 rounded-[var(--radius)] bg-inset p-0.5">
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={locale === code}
          title={t.language[code]}
          onClick={() => locale !== code && setLanguage(code)}
          className={`h-7 rounded-[calc(var(--radius)-2px)] px-2 text-fine font-semibold uppercase transition-colors duration-150 ${
            locale === code ? "bg-card text-heading shadow-[var(--shadow-paper)]" : "text-muted hover:text-heading"
          }`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
