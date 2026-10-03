"use client";

import { Settings } from "lucide-react";
import { useHydrated } from "@/lib/useHydrated";
import { PlatformSettings } from "@/components/settings/PlatformSettings";
import { FeedSettings } from "@/components/settings/FeedSettings";
import { CalendarSubscriptionSettings } from "@/components/settings/CalendarSubscriptionSettings";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { DataSettings } from "@/components/settings/DataSettings";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-6 w-40 animate-pulse rounded-md bg-border/40" />
      <div className="h-48 animate-pulse rounded-lg border border-border bg-border/40" />
    </div>
  );
}

export default function SettingsPage() {
  const hydrated = useHydrated();

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 sm:gap-12">
      <SectionHeading
        as="h1"
        eyebrow="Beállítások"
        icon={Settings}
        title="A te hajód, a te szabályaid."
        sub="Platformok, naptárak, értesítések és az adataid. Az adataid a böngésződben maradnak, amíg be nem kapcsolod a naptár-előfizetést."
      />

      {!hydrated ? (
        <SettingsSkeleton />
      ) : (
        <>
          <Reveal>
            <PlatformSettings />
          </Reveal>
          <Reveal>
            <FeedSettings />
          </Reveal>
          <Reveal>
            <CalendarSubscriptionSettings />
          </Reveal>
          <Reveal>
            <NotificationSettings />
          </Reveal>
          <Reveal>
            <DataSettings />
          </Reveal>
        </>
      )}
    </div>
  );
}
