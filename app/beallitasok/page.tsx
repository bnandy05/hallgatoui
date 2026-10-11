"use client";

import { useSyncExternalStore } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useDataReady } from "@/lib/useDataReady";
import { useSyncLabel } from "@/components/SyncStatus";
import { AccountSettings } from "@/components/settings/AccountSettings";
import { DemoAccountSettings } from "@/components/demo/DemoAccountSettings";
import { useDemoMode } from "@/lib/useDemoMode";
import { useStore } from "@/lib/store";
import { useNotificationPermission } from "@/lib/useNotificationPermission";
import { PlatformSettings } from "@/components/settings/PlatformSettings";
import { FeedSettings } from "@/components/settings/FeedSettings";
import { CalendarSubscriptionSettings } from "@/components/settings/CalendarSubscriptionSettings";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { DigestSettings } from "@/components/settings/DigestSettings";
import { DataSettings } from "@/components/settings/DataSettings";
import { useT } from "@/lib/i18n/I18nProvider";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { TabPanel, Tabs } from "@/components/ui/Tabs";

const SECTIONS = ["fiok", "naptarak", "exportalas", "ertesitesek", "megjelenes", "platformok", "adatok"] as const;
type SectionKey = (typeof SECTIONS)[number];

// Anchors used by links elsewhere in the app, mapped onto their tab.
const HASH_ALIASES: Record<string, SectionKey> = {
  elofizetes: "exportalas",
  "naptar-elofizetes": "exportalas",
  "naptar-exportalas": "exportalas",
  hirlevel: "ertesitesek",
};
const HASH_EVENT = "settings-hash";

function sectionFromHash(hash: string): SectionKey {
  const key = decodeURIComponent(hash.replace(/^#/, ""));
  if (key in HASH_ALIASES) return HASH_ALIASES[key];
  return (SECTIONS as readonly string[]).includes(key) ? (key as SectionKey) : "fiok";
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
  const t = useT();
  const hydrated = useDataReady();
  const accountEmail = useStore((s) => s.account?.email);
  const demo = useDemoMode();
  const sync = useSyncLabel();
  const active = useSyncExternalStore(
    subscribeHash,
    () => sectionFromHash(window.location.hash),
    () => "fiok" as SectionKey
  );
  const hasHash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash.length > 1,
    () => false
  );
  const feedCount = useStore((s) => s.feeds.length + s.timetableSources.length);
  const customCount = useStore((s) => s.customPlatforms.length);
  const notificationsOn = useStore((s) => s.notificationPrefs.enabled);
  const themePref = useStore((s) => s.theme);
  const permission = useNotificationPermission();

  const status = (on: boolean) => (
    <span
      aria-label={on ? t.settings.on : t.settings.off}
      className={`h-2 w-2 rounded-full ${on ? "bg-success" : "border border-border-strong"}`}
    />
  );

  const notificationsActive = notificationsOn && permission === "granted";
  const sections: { id: SectionKey; label: string; summary: string; on?: boolean }[] = [
    { id: "fiok", label: t.settings.tabs.fiok, summary: demo ? t.demo.bannerShort : accountEmail ? `${accountEmail}${sync ? ` · ${sync.label}` : ""}` : t.settings.signedIn },
    { id: "naptarak", label: t.settings.tabs.naptarak, summary: feedCount > 0 ? t.settings.summaries.sources(feedCount) : t.settings.summaries.noSources },
    { id: "exportalas", label: t.settings.tabs.exportalas, summary: t.settings.summaries.export },
    {
      id: "ertesitesek",
      label: t.settings.tabs.ertesitesek,
      summary: notificationsActive ? t.settings.summaries.enabled : t.settings.summaries.disabled,
      on: notificationsActive,
    },
    { id: "megjelenes", label: t.settings.tabs.megjelenes, summary: t.appearance.themes[themePref].label },
    { id: "platformok", label: t.settings.tabs.platformok, summary: customCount > 0 ? t.settings.summaries.customPlatforms(customCount) : t.settings.summaries.builtInPlatforms },
    { id: "adatok", label: t.settings.tabs.adatok, summary: t.settings.summaries.data },
  ];
  const activeLabel = sections.find((x) => x.id === active)?.label ?? "";

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      {/* Narrow screens: a section opened from the index gets a way back instead of the big title. */}
      {hydrated && hasHash ? (
        <>
          <div className="hidden lg:block">
            <SectionHeading as="h1" title={t.settings.title} />
          </div>
          <button
            type="button"
            onClick={backToIndex}
            className="-mb-4 inline-flex w-fit items-center gap-1.5 text-[14px] font-semibold text-muted hover:text-heading lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
            {t.settings.title}
            <span className="sr-only">{t.settings.backToList(activeLabel)}</span>
          </button>
        </>
      ) : (
        <SectionHeading as="h1" title={t.settings.title} />
      )}

      {!hydrated ? (
        <SettingsSkeleton />
      ) : (
        <>
          {!hasHash && (
            <nav aria-label={t.settings.sectionsLabel} className="lg:hidden">
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
                label={t.settings.sectionsLabel}
                orientation="vertical"
                value={active}
                onChange={selectSection}
                items={[
                  { id: "fiok", label: t.settings.tabs.fiok },
                  { id: "naptarak", label: t.settings.tabs.naptarak, count: feedCount > 0 ? feedCount : undefined },
                  { id: "exportalas", label: t.settings.tabs.exportalas },
                  {
                    id: "ertesitesek",
                    label: (
                      <span className="inline-flex items-center gap-2">
                        {t.settings.tabs.ertesitesek} {status(notificationsOn && permission === "granted")}
                      </span>
                    ),
                  },
                  { id: "megjelenes", label: t.settings.tabs.megjelenes },
                  { id: "platformok", label: t.settings.tabs.platformok },
                  { id: "adatok", label: t.settings.tabs.adatok },
                ]}
              />
            </div>

            <div className="min-w-0 max-w-[760px]">
              <TabPanel id="fiok" active={active === "fiok"}>
                {demo ? <DemoAccountSettings /> : <AccountSettings />}
              </TabPanel>
              <TabPanel id="naptarak" active={active === "naptarak"}>
                <div className="flex flex-col gap-10">
                  <FeedSettings />
                </div>
              </TabPanel>
              <TabPanel id="exportalas" active={active === "exportalas"}>
                <CalendarSubscriptionSettings />
              </TabPanel>
              <TabPanel id="ertesitesek" active={active === "ertesitesek"}>
                <div className="flex flex-col gap-10">
                  <NotificationSettings />
                  <DigestSettings />
                </div>
              </TabPanel>
              <TabPanel id="megjelenes" active={active === "megjelenes"}>
                <AppearanceSettings />
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
