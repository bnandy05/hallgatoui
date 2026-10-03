"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface RevealProps {
  children: ReactNode;
  /** Domino delay (.04s + i*.05s) on the direct children. */
  stagger?: boolean;
  className?: string;
}

/**
 * Fades/slides content in once when it scrolls into view. The server and the first client
 * render are identical (visible); the hidden state is armed in an effect, so a missing
 * IntersectionObserver or reduced motion simply leaves the content visible.
 */
export function Reveal({ children, stagger = false, className = "" }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "armed" | "in">("idle");

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
    setState("armed");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setState("in");
            io.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [stagger]);

  const classes = [
    state !== "idle" ? "reveal-armed" : "",
    state === "in" ? "reveal-in" : "",
    stagger ? "reveal-stagger" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={ref} className={classes}>
      {children}
    </div>
  );
}
