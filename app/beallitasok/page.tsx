"use client";

import { useHydrated } from "@/lib/useHydrated";
import { PlatformSettings } from "@/components/settings/PlatformSettings";
import { FeedSettings } from "@/components/settings/FeedSettings";

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
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Beállítások</h1>

      {!hydrated ? (
        <SettingsSkeleton />
      ) : (
        <>
          <PlatformSettings />
          <FeedSettings />
        </>
      )}
    </div>
  );
}
