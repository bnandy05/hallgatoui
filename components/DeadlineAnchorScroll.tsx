"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Fired after a link to a deadline on the page that is already open (the pathname doesn't change). */
export const DEADLINE_ANCHOR_EVENT = "deadline-anchor";

const PREFIX = "#hatarido-";
const FLASH_MS = 2200;

/**
 * Scrolls to the deadline named in the URL hash (`#hatarido-<id>`, see `deadlineAnchorId`) and rings
 * it for a moment. The browser can't do it alone: the lists render only once the data is ready, after
 * the navigation has already tried the hash. Renders nothing; mounted once the data is ready.
 */
export function DeadlineAnchorScroll() {
  const pathname = usePathname();

  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | undefined;
    let flash: ReturnType<typeof setTimeout> | undefined;
    let marked: Element | null = null;

    function unmark() {
      clearTimeout(flash);
      marked?.removeAttribute("data-flash");
      marked = null;
    }

    function seek() {
      clearInterval(poll);
      let tries = 0;
      poll = setInterval(() => {
        // Read every tick: after router.push the hash may arrive a moment later.
        const hash = window.location.hash;
        const el = hash.startsWith(PREFIX) ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
        if (el) {
          clearInterval(poll);
          unmark();
          const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          el.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
          el.setAttribute("data-flash", "");
          marked = el;
          flash = setTimeout(unmark, FLASH_MS);
        } else if (++tries > 30) {
          clearInterval(poll);
        }
      }, 100);
    }

    seek();
    window.addEventListener(DEADLINE_ANCHOR_EVENT, seek);
    window.addEventListener("hashchange", seek);
    return () => {
      clearInterval(poll);
      unmark();
      window.removeEventListener(DEADLINE_ANCHOR_EVENT, seek);
      window.removeEventListener("hashchange", seek);
    };
  }, [pathname]);

  return null;
}
