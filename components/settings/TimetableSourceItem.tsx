"use client";

import { format } from "date-fns";
import { Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { getPlatform } from "@/lib/platforms";
import type { TimetableSource } from "@/lib/types";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";

const day = (iso: string) => format(new Date(iso), "yyyy. MM. dd.");

export interface TimetableSourceItemProps {
  source: TimetableSource;
  busy: boolean;
  onReimport: (source: TimetableSource) => void;
  onEditMapping: (sourceId: string) => void;
}

/** One list row for an imported Neptun timetable, styled like the feed rows. */
export function TimetableSourceItem({ source, busy, onReimport, onEditMapping }: TimetableSourceItemProps) {
  const sessions = useStore((s) => s.classSessions);
  const customPlatforms = useStore((s) => s.customPlatforms);
  const removeTimetableSource = useStore((s) => s.removeTimetableSource);

  const own = sessions.filter((s) => s.sourceId === source.id);
  const classes = own.filter((s) => s.kind === "ora").length;
  const starts = own.map((s) => s.start).sort();
  const from = starts[0];
  const to = starts[starts.length - 1];

  function handleDelete() {
    if (confirm("Biztosan törlöd az órarendet? A tárgyaid és a határidőid megmaradnak.")) {
      removeTimetableSource(source.id);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 transition-colors hover:border-border-strong">
      <PlatformIcon platform={getPlatform("neptun", customPlatforms)} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{source.name}</span>
          <Pill>Órarend</Pill>
        </div>
        <p className="text-xs text-muted">
          {classes} óra
          {from && to && ` · ${day(from)} – ${day(to)}`}
          {` · importálva: ${day(source.importedAt)}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onReimport(source)}
          disabled={busy}
          aria-label="Újraimportálás"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
        <button
          type="button"
          aria-label="Hozzárendelés szerkesztése"
          onClick={() => onEditMapping(source.id)}
          className="rounded-md p-1.5 text-muted hover:bg-inset focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Törlés"
          onClick={handleDelete}
          className="rounded-md p-1.5 text-muted hover:bg-inset focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
