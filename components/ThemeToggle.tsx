"use client";

import { Moon, Sun } from "lucide-react";
import { useStore } from "@/lib/store";
import { systemTheme } from "@/lib/theme";
import { useActiveTheme } from "@/lib/useActiveTheme";
import { useT } from "@/lib/i18n/I18nProvider";
import { useHydrated } from "@/lib/useHydrated";

/** Header switch between the two lightings. Picking the system's own theme goes back to following it. */
export function ThemeToggle() {
  const hydrated = useHydrated();
  const t = useT();
  const active = useActiveTheme();
  const setTheme = useStore((s) => s.setTheme);
  const next = active === "dark" ? "light" : "dark";
  const label = next === "dark" ? t.theme.toDark : t.theme.toLight;

  return (
    <button
      type="button"
      disabled={!hydrated}
      onClick={() => setTheme(next === systemTheme() ? "system" : next)}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 shrink-0 items-center md:h-8 md:w-8 justify-center rounded-[var(--radius)] text-muted transition-colors duration-150 hover:bg-card/60 hover:text-heading disabled:opacity-50"
    >
      {active === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}
