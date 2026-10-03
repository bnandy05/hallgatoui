"use client";

import { useSyncExternalStore } from "react";
import { Settings } from "lucide-react";
import { useHydrated } from "@/lib/useHydrated";
import { useStore } from "@/lib/store";
import { useNotificationPermission } from "@/lib/useNotificationPermission";
import { PlatformSettings } from "@/components/settings/PlatformSettings";
import { FeedSettings } from "@/components/settings/FeedSettings";
import { TimetableSettings } from "@/components/settings/TimetableSettings";
import { CalendarSubscriptionSettings } from "@/components/settings/CalendarSubscriptionSettings";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { DataSettings } from "@/components/settings/DataSettings";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { TabPanel, Tabs } from "@/components/ui/Tabs";

const SECTIONS = ["naptarak", "elofizetes", "ertesitesek", "platformok", "adatok"] as const;
type SectionKey = (typeof SECTIONS)[number];

// Anchors used by links elsewhere in the app, mapped onto their tab.
const HASH_ALIASES: Record<string, SectionKey> = { "naptar-elofizetes": "elofizetes" };
const HASH_EVENT = "uj-settings-hash";

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

function SettingsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="h-40 animate-pulse rounded-[var(--radius)] border border-border bg-border/40" />
      <div className="h-72 animate-pulse rounded-[var(--radius)] border border-border bg-border/40" />
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
  const feedCount = useStore((s) => s.feeds.length);
  const subscribed = useStore((s) => s.subscription !== null);
  const notificationsOn = useStore((s) => s.notificationPrefs.enabled);
  const permission = useNotificationPermission();

  const status = (on: boolean) => (
    <span className={`text-[11px] ${on ? "text-success" : "text-muted-dim"}`}>{on ? "be" : "ki"}</span>
  );

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <SectionHeading
        as="h1"
        eyebrow="Beállítások"
        icon={Settings}
        title="A te füzeted, a te szabályaid."
        sub="Platformok, naptárak, értesítések és az adataid. Az adataid a böngésződben maradnak, amíg be nem kapcsolod a naptár-előfizetést."
      />

      {!hydrated ? (
        <SettingsSkeleton />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
          <div className="min-w-0 lg:sticky lg:top-[84px] lg:self-start">
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
                <TimetableSettings />
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
      )}
    </div>
  );
}
