"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { useHydrated } from "@/lib/useHydrated";
import { syncAllFeeds } from "@/lib/ical/client";

const NAV_LINKS = [
  { href: "/", label: "Tárgyaim" },
  { href: "/radar", label: "Határidő-radar" },
  { href: "/beallitasok", label: "Beállítások" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const didAutoSync = useRef(false);

  useEffect(() => {
    if (!hydrated || didAutoSync.current) return;
    didAutoSync.current = true;
    // Fire and forget: doesn't block the UI, errors are stored per-feed.
    void syncAllFeeds({ staleOnly: true });
  }, [hydrated]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/" className="text-base font-semibold text-foreground">
            Hallgatói réteg
          </Link>
          <nav className="flex items-center gap-4">
            {NAV_LINKS.map((link) => {
              const isActive =
                link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                    isActive ? "text-accent" : "text-muted hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
