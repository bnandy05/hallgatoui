"use client";

import { useEffect } from "react";

const TEXT_FIELD =
  "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=button]):not([type=submit]):not([type=reset]), textarea, [contenteditable]:not([contenteditable=false])";

/**
 * Publishes the visible part of the screen as CSS variables on <html>, so fixed surfaces can sit
 * above the on-screen keyboard:
 *
 * - `--visual-top` / `--visual-height`: the visual viewport in layout-viewport coordinates;
 * - `--keyboard-inset`: how much of the layout viewport's bottom is covered.
 *
 * Android Chrome shrinks the layout viewport itself (`interactiveWidget: "resizes-content"` in
 * the root layout), so the inset stays 0 there; iOS Safari only shrinks the visual viewport and
 * needs these. `data-keyboard` is set while a text field has focus on a touch screen.
 */
export function KeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    const coarse = window.matchMedia("(pointer: coarse)");

    const keepFocusedFieldVisible = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.matches(TEXT_FIELD) && active.closest("dialog[open]")) {
        active.scrollIntoView({ block: "nearest" });
      }
    };

    const update = () => {
      if (viewport) {
        const top = Math.max(0, viewport.offsetTop);
        const inset = Math.max(0, window.innerHeight - viewport.height - top);
        root.style.setProperty("--visual-top", `${top}px`);
        root.style.setProperty("--visual-height", `${viewport.height}px`);
        root.style.setProperty("--keyboard-inset", `${inset}px`);
      }
    };

    // The keyboard opening shrinks the sheet; keep the field being typed in on screen.
    const handleResize = () => {
      update();
      keepFocusedFieldVisible();
    };

    const updateFocus = () => {
      const active = document.activeElement;
      const typing = coarse.matches && active instanceof HTMLElement && active.matches(TEXT_FIELD);
      root.toggleAttribute("data-keyboard", typing);
    };

    update();
    updateFocus();
    viewport?.addEventListener("resize", handleResize);
    viewport?.addEventListener("scroll", update);
    document.addEventListener("focusin", updateFocus);
    document.addEventListener("focusout", updateFocus);
    return () => {
      viewport?.removeEventListener("resize", handleResize);
      viewport?.removeEventListener("scroll", update);
      document.removeEventListener("focusin", updateFocus);
      document.removeEventListener("focusout", updateFocus);
      for (const name of ["--visual-top", "--visual-height", "--keyboard-inset"]) root.style.removeProperty(name);
      root.removeAttribute("data-keyboard");
    };
  }, []);

  return null;
}
