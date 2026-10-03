"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { BellOff, BellRing, LayoutGrid, Radar, Sailboat, Settings } from "lucide-react";
import { useHydrated } from "@/lib/useHydrated";
import { useStore } from "@/lib/store";
import { useNotificationPermission } from "@/lib/useNotificationPermission";
import { NotificationScheduler } from "@/components/NotificationScheduler";
import { SubscriptionSync } from "@/components/SubscriptionSync";
import { CommandPalette } from "@/components/CommandPalette";
import { TraceField } from "@/components/ui/TraceField";
import { syncAllFeeds } from "@/lib/ical/client";

const NAV_LINKS = [
  { href: "/", label: "Tárgyaim", icon: LayoutGrid },
  { href: "/radar", label: "Határidő-radar", icon: Radar },
  { href: "/beallitasok", label: "Beállítások", icon: Settings },
] as const;

function NotificationBell() {
  const hydrated = useHydrated();
  const enabled = useStore((s) => s.notificationPrefs.enabled);
  const permission = useNotificationPermission();
  const on = hydrated && enabled && permission === "granted";
  const Icon = on ? BellRing : BellOff;
  const label = `Értesítések: ${on ? "bekapcsolva" : "kikapcsolva"}`;
  return (
    <Link
      href="/beallitasok#ertesitesek"
      aria-label={label}
      title={label}
      className={`lift-sm inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-card p-2 text-sm font-semibold hover:border-accent ${
        on ? "text-accent-text" : "text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
    </Link>
  );
}

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
    <div className="isolate flex min-h-full flex-1 flex-col">
      {/* Site-wide ambient background, behind everything (isolate keeps -z-10 above the body). */}
      <TraceField fixed className="-z-10" />
      {hydrated && <NotificationScheduler />}
      {hydrated && <SubscriptionSync />}
      <header className="sticky top-0 z-10 border-b border-[var(--nav-line)] bg-[rgba(20,28,46,0.85)] backdrop-blur-[10px]">
        <div className="mx-auto flex h-[60px] w-full max-w-[1080px] items-center gap-2 px-4 sm:gap-5 sm:px-[22px]">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 text-[17px] font-bold tracking-[0.2px] text-heading"
          >
            <Sailboat className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <span className="hidden sm:inline">Hallgatói réteg</span>
            <span className="sm:hidden">HR</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 sm:gap-5">
            {NAV_LINKS.map((link) => {
              const isActive =
                link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-label={link.label}
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-md p-2 text-sm font-medium transition-colors sm:border-b-2 sm:rounded-none sm:px-0 sm:py-1 ${
                    isActive
                      ? "text-accent-text sm:border-accent"
                      : "text-muted hover:text-foreground sm:border-transparent"
                  }`}
                >
                  <Icon className="h-5 w-5 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              );
            })}
          </nav>
          <CommandPalette />
          <NotificationBell />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col px-4 py-8 sm:px-[22px] sm:py-10">
        {children}
      </main>
      <footer className="border-t border-border py-[30px] text-[13px] text-muted">
        <div className="mx-auto flex w-full max-w-[1080px] flex-wrap items-center justify-between gap-3 px-4 sm:px-[22px]">
          <span>Hallgatói réteg · az adataid a böngésződben maradnak (kivéve, ha bekapcsolod a naptár-előfizetést).</span>
          <span>Nem állunk kapcsolatban a Neptunnal. Sem a rendszerrel, sem az istennel.</span>
        </div>
      </footer>
    </div>
  );
}
