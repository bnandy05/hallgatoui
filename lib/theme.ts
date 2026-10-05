/** The user's choice: follow the operating system, or force one theme. Device preference. */
export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_PREFS: readonly ThemePref[] = ["system", "light", "dark"];

/** The felt colour per theme, for the browser chrome (`theme-color`). Keep in sync with tokens.css. */
export const THEME_COLOR: Record<Theme, string> = { light: "#dde2e4", dark: "#171b1e" };

/** Paper and pin colours of the logo mark for the generated icons (light tokens `--panel` and `--pin`). */
export const ICON_COLORS = { paper: "#fdfdfa", pin: "#d8352a" } as const;

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs in <head> before the first paint: reads the persisted store and sets `data-theme` on <html>,
 * so a dark page never flashes light. Kept dependency-free; mirrors `resolveTheme` and `applyTheme`.
 */
export const THEME_SCRIPT = `(function(){try{var p="system";try{var s=JSON.parse(localStorage.getItem("hallgatoireteg-v1")||"null");if(s&&s.state&&s.state.theme)p=s.state.theme}catch(e){}var t=p==="light"||p==="dark"?p:(window.matchMedia("${DARK_QUERY}").matches?"dark":"light");var r=document.documentElement;r.setAttribute("data-theme",t);r.style.colorScheme=t;var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){m[i].setAttribute("content",t==="dark"?"${THEME_COLOR.dark}":"${THEME_COLOR.light}");m[i].removeAttribute("media")}}catch(e){}})()`;

export function systemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function resolveTheme(pref: ThemePref): Theme {
  return pref === "system" ? systemTheme() : pref;
}

/** Sets the theme on <html> and the browser chrome; cross-fades when the browser can and motion is welcome. */
export function applyTheme(theme: Theme, { animate = false } = {}) {
  const root = document.documentElement;
  if (root.getAttribute("data-theme") === theme) return;
  const set = () => {
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.setAttribute("content", THEME_COLOR[theme]);
      meta.removeAttribute("media");
    }
  };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (animate && !reduced && typeof document.startViewTransition === "function") {
    const transition = document.startViewTransition(set);
    // An aborted transition (hidden tab, a second toggle mid-fade) still applies the theme; ignore the rejection.
    for (const p of [transition.ready, transition.finished, transition.updateCallbackDone]) p.catch(() => {});
  } else {
    set();
  }
}

export function subscribeSystemTheme(callback: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
