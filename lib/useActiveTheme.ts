import { useSyncExternalStore } from "react";
import type { Theme } from "@/lib/theme";

function subscribeRootTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/** The theme currently on the page (light on the server and during hydration). */
export function useActiveTheme(): Theme {
  return useSyncExternalStore(
    subscribeRootTheme,
    () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"),
    () => "light"
  );
}
