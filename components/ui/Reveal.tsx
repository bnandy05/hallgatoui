"use client";

import { useEffect, useRef, type ReactNode } from "react";

export interface RevealProps {
  children: ReactNode;
  /** Domino delay (.04s + i*.05s) on the direct children. */
  stagger?: boolean;
  className?: string;
}

/**
 * Fades/slides content in once when it scrolls into view. The server and the first client
 * render are identical (visible); the hidden state is armed by toggling classes in an
 * effect, so a missing IntersectionObserver or reduced motion simply leaves it visible.
 */
export function Reveal({ children, stagger = false, className = "" }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    if (stagger) {
      // Per-child index for the domino delay (CSS reads --i).
      Array.from(el.children).forEach((child, i) => {
        (child as HTMLElement).style.setProperty("--i", String(i));
      });
    }
    el.classList.add("reveal-armed");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          el.classList.add("reveal-in");
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      el.classList.remove("reveal-armed", "reveal-in");
    };
  }, [stagger]);

  return (
    <div ref={ref} className={`${stagger ? "reveal-stagger" : ""} ${className}`.trim()}>
      {children}
    </div>
  );
}
