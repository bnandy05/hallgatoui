"use client";

import { useSyncExternalStore } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useHydrated } from "@/lib/useHydrated";
import { useStore } from "@/lib/store";
import { useNotificationPermission } from "@/lib/useNotificationPermission";
import { PlatformSettings } from "@/components/settings/PlatformSettings";
import { FeedSettings } from "@/components/settings/FeedSettings";
import { CalendarSubscriptionSettings } from "@/components/settings/CalendarSubscriptionSettings";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { DataSettings } from "@/components/settings/DataSettings";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { TabPanel, Tabs } from "@/components/ui/Tabs";

const SECTIONS = ["naptarak", "elofizetes", "ertesitesek", "platformok", "adatok"] as const;
type SectionKey = (typeof SECTIONS)[number];

// Anchors used by links elsewhere in the app, mapped onto their tab.
const HASH_ALIASES: Record<string, SectionKey> = { "naptar-elofizetes": "elofizetes" };
const HASH_EVENT = "settings-hash";

function sectionFromHash(hash: string): SectionKey {
  const key = decodeURIComponent(hash.replace(/^#/, ""));
  if (key in HASH_ALIASES) return HASH_ALIASES[key];
  return (SECTIONS as readonly string[]).includes(key) ? (key as SectionKey) : "naptarak";
}

function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener(HASH_EVENT, callback);
  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener(HASH_EVENT, callback);
  };
}

function selectSection(key: string) {
  // replaceState keeps the tab in the URL without a scroll jump or a history entry per click.
  history.replaceState(null, "", `#${key}`);
  window.dispatchEvent(new Event(HASH_EVENT));
}

// Narrow screens drill into a section from the index: a history entry, so Back returns to it.
function openSection(key: string) {
  history.pushState({ settingsDrill: true }, "", `#${key}`);
  window.dispatchEvent(new Event(HASH_EVENT));
  window.scrollTo(0, 0);
}

function backToIndex() {
  if ((history.state as { settingsDrill?: boolean } | null)?.settingsDrill) {
    history.back();
  } else {
    history.replaceState(null, "", window.location.pathname);
    window.dispatchEvent(new Event(HASH_EVENT));
  }
}

function SettingsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="h-40 rounded-[var(--radius-slip)] bg-strip/80" />
      <div className="h-72 rounded-[var(--radius-slip)] bg-strip/80" />
    </div>
  );
}

export default function WeekSettingsPage() {
  const hydrated = useHydrated();
  const active = useSyncExternalStore(
    subscribeHash,
    () => sectionFromHash(window.location.hash),
    () => "naptarak" as SectionKey
  );
  const hasHash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash.length > 1,
    () => false
  );
  const feedCount = useStore((s) => s.feeds.length + s.timetableSources.length);
  const customCount = useStore((s) => s.customPlatforms.length);
  const subscribed = useStore((s) => s.subscription !== null);
  const notificationsOn = useStore((s) => s.notificationPrefs.enabled);
  const permission = useNotificationPermission();

  const status = (on: boolean) => (
    <span
      aria-label={on ? "bekapcsolva" : "kikapcsolva"}
      className={`h-2 w-2 rounded-full ${on ? "bg-success" : "border border-border-strong"}`}
    />
  );

  const notificationsActive = notificationsOn && permission === "granted";
  const sections: { id: SectionKey; label: string; summary: string; on?: boolean }[] = [
    { id: "naptarak", label: "Naptárak", summary: feedCount > 0 ? `${feedCount} forrás` : "Még nincs forrás" },
    { id: "elofizetes", label: "Előfizetés", summary: subscribed ? "Bekapcsolva" : "Kikapcsolva", on: subscribed },
    {
      id: "ertesitesek",
      label: "Értesítések",
      summary: notificationsActive ? "Bekapcsolva" : "Kikapcsolva",
      on: notificationsActive,
    },
    { id: "platformok", label: "Platformok", summary: customCount > 0 ? `${customCount} saját platform` : "Beépített platformok" },
    { id: "adatok", label: "Adatok", summary: "Mentés, visszaállítás, törlés" },
  ];
  const activeLabel = sections.find((x) => x.id === active)?.label ?? "";

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      {/* Narrow screens: a section opened from the index gets a way back instead of the big title. */}
      {hydrated && hasHash ? (
        <>
          <div className="hidden lg:block">
            <SectionHeading as="h1" title="Beállítások" />
          </div>
          <button
            type="button"
            onClick={backToIndex}
            className="-mb-4 inline-flex w-fit items-center gap-1.5 text-[14px] font-semibold text-muted hover:text-heading lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
            Beállítások
            <span className="sr-only">, vissza a listához ({activeLabel})</span>
          </button>
        </>
      ) : (
        <SectionHeading as="h1" title="Beállítások" />
      )}

      {!hydrated ? (
        <SettingsSkeleton />
      ) : (
        <>
          {!hasHash && (
            <nav aria-label="Beállítások szakaszai" className="lg:hidden">
              <ul className="sheet-paper divide-y divide-border/70">
                {sections.map((section) => (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => openSection(section.id)}
                      className="flex w-full items-center gap-3 px-5 py-4 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-semibold text-heading">{section.label}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[13.5px] text-muted">
                          {section.on !== undefined && status(section.on)}
                          {section.summary}
                        </span>
                      </span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div
            className={`grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10 ${
              hasHash ? "" : "max-lg:hidden"
            }`}
          >
            <div className="hidden min-w-0 lg:sticky lg:top-[96px] lg:block lg:self-start">
              <Tabs
                label="Beállítások szakaszai"
                orientation="vertical"
                value={active}
                onChange={selectSection}
                items={[
                  { id: "naptarak", label: "Naptárak", count: feedCount > 0 ? feedCount : undefined },
                  {
                    id: "elofizetes",
                    label: <span className="inline-flex items-center gap-2">Előfizetés {status(subscribed)}</span>,
                  },
                  {
                    id: "ertesitesek",
                    label: (
                      <span className="inline-flex items-center gap-2">
                        Értesítések {status(notificationsOn && permission === "granted")}
                      </span>
                    ),
                  },
                  { id: "platformok", label: "Platformok" },
                  { id: "adatok", label: "Adatok" },
                ]}
              />
            </div>

            <div className="min-w-0 max-w-[760px]">
              <TabPanel id="naptarak" active={active === "naptarak"}>
                <div className="flex flex-col gap-10">
                  <FeedSettings />
                </div>
              </TabPanel>
              <TabPanel id="elofizetes" active={active === "elofizetes"}>
                <CalendarSubscriptionSettings />
              </TabPanel>
              <TabPanel id="ertesitesek" active={active === "ertesitesek"}>
                <NotificationSettings />
              </TabPanel>
              <TabPanel id="platformok" active={active === "platformok"}>
                <PlatformSettings />
              </TabPanel>
              <TabPanel id="adatok" active={active === "adatok"}>
                <DataSettings />
              </TabPanel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
