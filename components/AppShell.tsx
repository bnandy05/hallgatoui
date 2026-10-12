"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, ListTodo, Plus, Settings } from "lucide-react";
import { useHydrated } from "@/lib/useHydrated";
import { useDataReady } from "@/lib/useDataReady";
import { isPublicPath } from "@/lib/account/path";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { AccountSync } from "@/components/AccountSync";
import { SyncStatus } from "@/components/SyncStatus";
import { NotificationScheduler } from "@/components/NotificationScheduler";
import { RemindersMenu } from "@/components/RemindersMenu";
import { KeyboardInset } from "@/components/KeyboardInset";
import { CommandPalette } from "@/components/CommandPalette";
import { DeadlineDialog } from "@/components/DeadlineDialog";
import { PinboardField } from "@/components/ui/PinboardField";
import { ThemeSync } from "@/components/ThemeSync";
import { ThemeToggle } from "@/components/ThemeToggle";
import { buttonClasses } from "@/components/ui/Button";
import { syncAllFeeds } from "@/lib/ical/client";
import { useT } from "@/lib/i18n/I18nProvider";
import { useDemoMode } from "@/lib/useDemoMode";
import { DemoBar } from "@/components/demo/DemoBar";
import { DemoTour } from "@/components/demo/DemoTour";
import { DeadlineAnchorScroll } from "@/components/DeadlineAnchorScroll";

const NAV_LINKS = [
  { href: "/", key: "week", icon: CalendarDays },
  { href: "/radar", key: "deadlines", icon: ListTodo },
  { href: "/beallitasok", key: "settings", icon: Settings },
] as const;

function isActiveLink(href: string, pathname: string) {
  return href === "/" ? pathname === "/" || pathname.startsWith("/targy") : pathname.startsWith(href);
}

/** Narrow screens: the main navigation sits at the bottom edge, within thumb reach. */
function TabBar({ pathname }: { pathname: string }) {
  const t = useT();
  return (
    <nav
      aria-label={t.nav.label}
      data-tabbar
      className="fixed inset-x-0 bottom-0 z-10 border-t border-felt-dark bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-3 gap-1 px-2 py-1.5">
        {NAV_LINKS.map((link) => {
          const isActive = isActiveLink(link.href, pathname);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-[var(--radius)] text-fine font-semibold transition-colors duration-150 ${
                isActive ? "bg-card text-heading shadow-[var(--shadow-paper)]" : "text-muted active:bg-card/60"
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {t.nav[link.key]}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Wordmark() {
  const t = useT();
  return (
    <Link href="/" className="group relative flex shrink-0 items-center gap-2.5 pr-1 text-heading">
      <span aria-hidden="true" className="relative block h-[22px] w-[18px]">
        <span className="absolute inset-x-0 bottom-0 top-[5px] rounded-[var(--radius-slip)] bg-card shadow-[var(--shadow-paper)] transition-transform duration-300 ease-[var(--ease-out-expo)] group-hover:-rotate-3" />
        <span className="pin left-[3.5px] top-0" />
      </span>
      <span className="font-display text-subhead leading-none tracking-[0.005em]">
        {t.shell.brand}
      </span>
    </Link>
  );
}

function NewDeadlineButton() {
  const t = useT();
  const hydrated = useDataReady();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={!hydrated}
        onClick={() => setOpen(true)}
        aria-label={t.shell.newDeadline}
        data-tour="new-deadline"
        className={buttonClasses({ size: "sm", className: "max-md:!h-9 !px-2.5 sm:!px-3" })}
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">{t.shell.newDeadline}</span>
      </button>
      <DeadlineDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const hydrated = useHydrated();
  const dataReady = useDataReady();
  const bare = isPublicPath(pathname);
  const demo = useDemoMode() && !bare;
  const didAutoSync = useRef(false);

  useEffect(() => {
    if (!dataReady || bare || didAutoSync.current) return;
    didAutoSync.current = true;
    // Fire and forget: doesn't block the UI, errors are stored per-feed.
    void syncAllFeeds({ staleOnly: true });
  }, [dataReady, bare]);

  return (
    <div className="isolate flex min-h-full flex-1 flex-col">
      <PinboardField />
      <KeyboardInset />
      {hydrated && <ThemeSync />}
      {hydrated && <AccountSync />}
      {hydrated && <ServiceWorkerRegister />}
      {dataReady && !bare && <NotificationScheduler />}
      {dataReady && !bare && <DeadlineAnchorScroll />}
      <header className="sticky top-0 z-10 border-b border-felt-dark bg-background">
        <div className="mx-auto flex h-14 w-full max-w-[1240px] items-center gap-2 px-4 sm:gap-6 sm:px-6 md:h-16">
          <Wordmark />
          {!bare && (
          <nav aria-label={t.nav.label} className="ml-4 hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => {
              const isActive = isActiveLink(link.href, pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative inline-flex h-9 items-center rounded-[var(--radius)] px-3 text-body font-semibold transition-colors duration-150 ${
                    isActive
                      ? "bg-card text-heading shadow-[var(--shadow-paper)]"
                      : "text-muted hover:bg-card/60 hover:text-heading"
                  }`}
                >
                  {t.nav[link.key]}
                </Link>
              );
            })}
          </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            {!bare && <SyncStatus compact />}
            {dataReady && !bare && <RemindersMenu />}
            <ThemeToggle />
            {!bare && <CommandPalette />}
            {!bare && <NewDeadlineButton />}
          </div>
        </div>
      </header>
      {hydrated && demo && <DemoBar />}
      <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        {children}
      </main>
      <footer className="border-t border-felt-dark pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 text-small text-muted-dim md:pb-6">
        <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 sm:px-6">
          <span>{demo ? t.demo.bannerShort : t.shell.footerData}</span>
          <span className="flex flex-wrap gap-x-6 gap-y-1">
            <span>{t.shell.footerIndependent}</span>
            <Link href="/adatvedelem" className="underline underline-offset-2 hover:text-muted">
              {t.shell.footerPrivacy}
            </Link>
          </span>
        </div>
      </footer>
      {!bare && <TabBar pathname={pathname} />}
      {hydrated && demo && <DemoTour />}
    </div>
  );
}
