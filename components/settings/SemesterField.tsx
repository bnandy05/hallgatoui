"use client";

import { useId, useState } from "react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n/I18nProvider";
import type { Messages } from "@/lib/i18n";
import { normalizeSemesterStart, proposeSemesterStart } from "@/lib/timetable/semester";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

function dayText(ymd: string, t: Messages): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return t.semesterField.day(y, t.rules.instances.monthsShort[m - 1], d);
}

/** Week 1 of the teaching period: the base of the week numbers in requirement links. */
export function SemesterField({ compact = false }: { compact?: boolean }) {
  const tAll = useT();
  const t = tAll.semesterField;
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
      <label htmlFor={id} className="text-body font-semibold text-heading">
        {t.label}
      </label>
      {!compact && (
        <p className="text-small text-muted">{t.hint}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input id={id} type="date" value={draft} onChange={(e) => setDraft(e.target.value)} className="!w-auto" />
        <Button type="button" size="sm" variant="secondary" disabled={!normalized || !changed} onClick={() => setSemester(normalized)}>
          {tAll.common.save}
        </Button>
        {semester && (
          <span className="text-small text-muted">{t.mondayOfWeek1(dayText(semester.start, tAll))}</span>
        )}
        {!semester && proposal && <span className="text-small text-muted">{t.proposed}</span>}
      </div>
    </div>
  );
}
