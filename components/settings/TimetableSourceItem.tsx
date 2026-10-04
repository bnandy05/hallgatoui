"use client";

import { format } from "date-fns";
import { Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { getPlatform } from "@/lib/platforms";
import type { TimetableSource } from "@/lib/types";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Button } from "@/components/ui/Button";

const day = (iso: string) => format(new Date(iso), "yyyy. MM. dd.");

export interface TimetableSourceItemProps {
  source: TimetableSource;
  busy: boolean;
  onReimport: (source: TimetableSource) => void;
  onEditMapping: (sourceId: string) => void;
}

/** An imported Neptun timetable as a card on sky-blue timetable paper, taped flat like its classes. */
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
    <li className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-slip)] bg-sky px-4 pb-3 pt-4">
      <div className="flex items-start gap-3">
        <PlatformIcon platform={getPlatform("neptun", customPlatforms)} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold text-heading">{source.name}</p>
          <p className="text-[12.5px] text-muted">Órarend · importálva: {day(source.importedAt)}</p>
        </div>
      </div>
      <p className="text-[13.5px] text-muted">
        {classes} óra
        {from && to && ` · ${day(from)} – ${day(to)}`}
      </p>
      <div className="-mx-1.5 mt-auto flex flex-wrap items-center gap-1 border-t border-black/[0.08] pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => onReimport(source)} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Újraimportálás
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onEditMapping(source.id)}>
          <Pencil className="h-4 w-4" />
          Tárgyak
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          aria-label={`${source.name} törlése`}
          className="ml-auto text-danger hover:!bg-danger/10"
        >
          <Trash2 className="h-4 w-4" />
          Törlés
        </Button>
      </div>
    </li>
  );
}
