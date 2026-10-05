"use client";

import { useStore } from "@/lib/store";

/** Text of the sync status, or null while there is nothing to show (not signed in yet). */
const OFFLINE_TEXT = "Offline – a módosítások ezen az eszközön megmaradnak, és feltöltjük őket, amint újra van kapcsolat.";

export function useSyncLabel(): { label: string; tone: "ok" | "busy" | "offline" | "bad"; title?: string } | null {
  const account = useStore((s) => s.account);
  const status = useStore((s) => s.syncStatus);
  const error = useStore((s) => s.syncError);
  if (!account) return null;
  if (status === "saving") return { label: "Mentés…", tone: "busy" };
  if (status === "offline") return { label: "Offline", tone: "offline", title: OFFLINE_TEXT };
  if (status === "error") return { label: error ?? "Nem sikerült menteni", tone: "bad" };
  return { label: "Mentve", tone: "ok" };
}

const DOT = { ok: "bg-success", busy: "bg-muted-dim", offline: "bg-canary ring-1 ring-border-strong", bad: "bg-danger" } as const;

/** One line: a dot and the state of the last save. `compact` is the header version (only when not "Mentve"). */
export function SyncStatus({ compact = false }: { compact?: boolean }) {
  const sync = useSyncLabel();
  if (!sync || (compact && sync.tone === "ok")) return null;
  return (
    <p
      role="status"
      className={`inline-flex items-center gap-1.5 text-[13px] ${sync.tone === "bad" ? "font-semibold text-danger" : "text-muted"}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT[sync.tone]}`} />
      <span className={compact ? "max-w-[9rem] truncate sm:max-w-[16rem]" : ""} title={sync.title ?? sync.label}>
        {compact ? sync.label : (sync.title ?? sync.label)}
      </span>
    </p>
  );
}
