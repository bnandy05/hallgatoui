"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { applyTheme, resolveTheme, subscribeSystemTheme } from "@/lib/theme";

/** Keeps <html data-theme> in step with the stored preference and, on "system", with the OS. */
export function ThemeSync() {
  const pref = useStore((s) => s.theme);
  const first = useRef(true);

  useEffect(() => {
    // The head script already applied the stored theme; later changes cross-fade.
    applyTheme(resolveTheme(pref), { animate: !first.current });
    first.current = false;
    if (pref !== "system") return;
    return subscribeSystemTheme(() => applyTheme(resolveTheme("system"), { animate: true }));
  }, [pref]);

  return null;
}
