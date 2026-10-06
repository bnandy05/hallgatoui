"use client";

import { useId, useState } from "react";
import { useStore } from "@/lib/store";
import { normalizeSemesterStart, proposeSemesterStart } from "@/lib/timetable/semester";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const MONTHS = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];

function dayText(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y}. ${MONTHS[m - 1]} ${d}.`;
}

/** Week 1 of the teaching period: the base of the week numbers in requirement links. */
export function SemesterField({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const semester = useStore((s) => s.semester);
  const sessions = useStore((s) => s.classSessions);
  const setSemester = useStore((s) => s.setSemester);
  const proposal = semester ? null : proposeSemesterStart(sessions);
  const [draft, setDraft] = useState(semester?.start ?? proposal ?? "");
  const normalized = draft ? normalizeSemesterStart(draft) : null;
  const changed = normalized !== (semester?.start ?? null);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-semibold text-heading">
        A szorgalmi időszak első hete
      </label>
      {!compact && (
        <p className="text-[13px] text-muted">
          Ettől számoljuk a heteket (pl. „zh a 9. héten”). Bármelyik napját megadhatod, a hét hétfőjét vesszük.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input id={id} type="date" value={draft} onChange={(e) => setDraft(e.target.value)} className="!w-auto" />
        <Button type="button" size="sm" variant="secondary" disabled={!normalized || !changed} onClick={() => setSemester(normalized)}>
          Mentés
        </Button>
        {semester && (
          <span className="text-[13px] text-muted">Az 1. hét hétfője: {dayText(semester.start)}</span>
        )}
        {!semester && proposal && <span className="text-[13px] text-muted">Az órarended alapján javasolt.</span>}
      </div>
    </div>
  );
}
