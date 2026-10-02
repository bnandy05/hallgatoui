"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { LayoutGrid, Radar, Settings } from "lucide-react";
import { useHydrated } from "@/lib/useHydrated";
import { CommandPalette } from "@/components/CommandPalette";
import { syncAllFeeds } from "@/lib/ical/client";

const NAV_LINKS = [
  { href: "/", label: "Tárgyaim", icon: LayoutGrid },
  { href: "/radar", label: "Határidő-radar", icon: Radar },
  { href: "/beallitasok", label: "Beállítások", icon: Settings },
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
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-3 py-3 sm:gap-6 sm:px-4">
          <Link
            href="/"
            className="shrink-0 text-base font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="hidden sm:inline">Hallgatói réteg</span>
            <span className="sm:hidden">HR</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-4">
            {NAV_LINKS.map((link) => {
              const isActive =
                link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-label={link.label}
                  className={`inline-flex items-center gap-1.5 rounded-md p-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent sm:p-0 ${
                    isActive ? "text-accent" : "text-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              );
            })}
          </nav>
          <CommandPalette />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
