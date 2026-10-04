"use client";

import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Theme, ThemePref } from "@/lib/theme";
import { SectionHeading } from "@/components/ui/SectionHeading";

export const THEME_LABELS: Record<ThemePref, string> = {
  system: "Rendszer szerint",
  light: "Világos",
  dark: "Sötét",
};

const OPTIONS: { pref: ThemePref; description: string }[] = [
  { pref: "system", description: "Követi az eszköz beállítását." },
  { pref: "light", description: "Mindig világos." },
  { pref: "dark", description: "Mindig sötét." },
];

/** A corner of the board in one lighting: felt, a day strip, two slips (one hot), drawn from that theme's tokens. */
function BoardSample({ theme, className = "" }: { theme: Theme; className?: string }) {
  return (
    <div data-theme={theme} aria-hidden="true" className={`flex h-full gap-2 overflow-hidden bg-background p-3 ${className}`}>
      <div className="flex flex-1 flex-col gap-2.5 rounded-[var(--radius-slip)] bg-strip p-2 pt-3">
        <div className="relative rounded-[var(--radius-slip)] bg-card px-2 pb-2 pt-2.5 shadow-[var(--shadow-paper)]">
          <span className="pin -top-[4px] left-2 !h-[8px] !w-[8px]" style={{ "--pin-color": "var(--pin)" } as CSSProperties} />
          <span className="block h-1.5 w-4/5 rounded-full bg-foreground/80" />
          <span className="mt-1.5 block h-1 w-1/2 rounded-full bg-muted-dim/70" />
        </div>
        <div className="relative rounded-[var(--radius-slip)] bg-card px-2 pb-2 pt-2.5 shadow-[var(--shadow-paper)]">
          <span className="pin -top-[4px] left-2 !h-[8px] !w-[8px]" style={{ "--pin-color": "var(--accent-2)" } as CSSProperties} />
          <span className="block h-1.5 w-3/5 rounded-full bg-foreground/80" />
          <span className="mt-1.5 block h-1 w-2/5 rounded-full bg-muted-dim/70" />
        </div>
      </div>
      <div className="flex w-[38%] flex-col gap-2.5 rounded-[var(--radius-slip)] bg-canary-soft p-2 pt-3">
        <div className="relative rounded-[var(--radius-slip)] bg-salmon px-2 pb-2 pt-2.5 shadow-[var(--shadow-paper)]">
          <span className="pin -top-[4px] left-2 !h-[8px] !w-[8px]" style={{ "--pin-color": "var(--pin)" } as CSSProperties} />
          <span className="block h-1.5 w-4/5 rounded-full bg-foreground/80" />
        </div>
      </div>
    </div>
  );
}

export function AppearanceSettings() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  return (
    <section id="megjelenes" className="flex flex-col gap-6">
      <SectionHeading title="Megjelenés" sub="Alapból az eszköz beállítását követi. A fejlécben lévő gombbal is válthatsz." />

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="sr-only">Téma</legend>
        {OPTIONS.map(({ pref, description }, i) => {
          const checked = theme === pref;
          return (
            <label
              key={pref}
              style={{ "--i": i } as CSSProperties}
              className={`sheet-paper group relative flex cursor-pointer flex-col overflow-hidden transition-shadow duration-150 hover:shadow-[var(--shadow-lift)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-accent ${
                checked ? "outline-2 outline-offset-0 outline-accent" : ""
              }`}
            >
              <input
                type="radio"
                name="theme"
                value={pref}
                checked={checked}
                onChange={() => setTheme(pref)}
                className="sr-only"
              />
              {pref === "system" ? (
                <div className="grid h-[104px] grid-cols-2 overflow-hidden border-b border-border">
                  <BoardSample theme="light" className="!pr-1" />
                  <BoardSample theme="dark" className="!pl-1" />
                </div>
              ) : (
                <BoardSample theme={pref} className="h-[104px] border-b border-border" />
              )}
              <span className="flex items-start gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-semibold text-heading">{THEME_LABELS[pref]}</span>
                  <span className="mt-0.5 block text-[13px] text-muted">{description}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
                    checked ? "border-accent bg-accent text-accent-ink" : "border-border-strong bg-inset"
                  }`}
                >
                  {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
    </section>
  );
}
