"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, ListTodo, Plus, Settings } from "lucide-react";
import { useHydrated } from "@/lib/useHydrated";
import { NotificationScheduler } from "@/components/NotificationScheduler";
import { SubscriptionSync } from "@/components/SubscriptionSync";
import { CommandPalette } from "@/components/CommandPalette";
import { DeadlineDialog } from "@/components/DeadlineDialog";
import { PinboardField } from "@/components/ui/PinboardField";
import { buttonClasses } from "@/components/ui/Button";
import { syncAllFeeds } from "@/lib/ical/client";

const NAV_LINKS = [
  { href: "/", label: "Hét", icon: CalendarDays },
  { href: "/radar", label: "Határidők", icon: ListTodo },
  { href: "/beallitasok", label: "Beállítások", icon: Settings },
] as const;

function Wordmark() {
  return (
    <Link href="/" className="group relative flex shrink-0 items-center gap-2.5 pr-1 text-heading">
      <span aria-hidden="true" className="relative block h-[22px] w-[18px]">
        <span className="absolute inset-x-0 bottom-0 top-[5px] rounded-[1px] bg-card shadow-[var(--shadow-paper)] transition-transform duration-300 ease-[var(--ease-out-expo)] group-hover:-rotate-3" />
        <span className="pin left-[3.5px] top-0" />
      </span>
      <span className="font-display text-[21px] leading-none tracking-[0.005em]">
        Hallgatói réteg
      </span>
    </Link>
  );
}

function NewDeadlineButton() {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={!hydrated}
        onClick={() => setOpen(true)}
        aria-label="Új határidő"
        className={buttonClasses({ size: "sm", className: "!px-2 sm:!px-3" })}
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Új határidő</span>
      </button>
      <DeadlineDialog open={open} onClose={() => setOpen(false)} />
    </>
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
      <PinboardField />
      {hydrated && <NotificationScheduler />}
      {hydrated && <SubscriptionSync />}
      <header className="sticky top-0 z-10 border-b border-felt-dark bg-background">
        <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center gap-2 px-4 sm:gap-6 sm:px-6">
          <Wordmark />
          <nav aria-label="Fő navigáció" className="ml-auto flex items-center gap-0.5 sm:ml-4 sm:gap-1">
            {NAV_LINKS.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/" || pathname.startsWith("/targy")
                  : pathname.startsWith(link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-label={link.label}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative inline-flex h-9 items-center gap-2 rounded-[var(--radius)] px-2.5 text-[14.5px] font-semibold transition-colors duration-150 md:px-3 ${
                    isActive
                      ? "bg-card text-heading shadow-[var(--shadow-paper)]"
                      : "text-muted hover:bg-card/60 hover:text-heading"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] md:hidden" aria-hidden="true" />
                  <span className="hidden md:inline">{link.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-1.5 sm:ml-auto sm:gap-2">
            <CommandPalette />
            <NewDeadlineButton />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        {children}
      </main>
      <footer className="border-t border-felt-dark py-6 text-[13px] text-muted-dim">
        <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 sm:px-6">
          <span>Az adataid ebben a böngészőben maradnak, amíg nem kapcsolod be a naptár-előfizetést.</span>
          <span>Független projekt, nem kapcsolódik a Neptunhoz.</span>
        </div>
      </footer>
    </div>
  );
}
