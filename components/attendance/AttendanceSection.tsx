"use client";
import { useId, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { attendanceSummary, type AttendanceGroup } from "@/lib/attendance";
import { useAttendance } from "@/lib/useAttendance";
import { useStore } from "@/lib/store";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { instanceSnapshot, shortDayLabel, type Instance } from "@/lib/rules/instances";
import { budapestDate, budapestInstant, budapestTime } from "@/lib/ical/budapest";
import { newId } from "@/lib/id";
import type { Course } from "@/lib/types";
import { AttendanceChoices } from "./AttendanceChoices";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import type { ResultPatch } from "@/components/requirements/InstanceInput";

export function AttendanceRecord({ group, instance, compact = false }: { group: AttendanceGroup; instance: Instance; compact?: boolean }) {
  const set = useStore((s) => s.setRequirementResult);
  const locale = useLocale();
  const componentId = instance.result?.componentId ?? group.target.id;
  return <AttendanceChoices result={instance.result} compact={compact} label={`${group.target.label}: ${instance.at ? shortDayLabel(new Date(instance.at), locale) : instance.key}`}
    onChange={(patch: ResultPatch) => set(group.courseId, componentId, instance.key, patch && { ...patch, ...instanceSnapshot(instance, locale) })} />;
}

function GroupHistory({ group, course, now }: { group: AttendanceGroup; course: Course; now: Date }) {
  const t = useT().attendance;
  const locale = useLocale();
  const id = useId();
  const updateCourse = useStore((s) => s.updateCourse);
  const setResult = useStore((s) => s.setRequirementResult);
  const summary = attendanceSummary(group, now);
  const [editLimit, setEditLimit] = useState(false);
  const [limit, setLimit] = useState(String(summary.limit ?? 3));
  const [all, setAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const today = budapestDate(now).map((v, i) => i ? String(v).padStart(2, "0") : String(v)).join("-");
  const [date, setDate] = useState(today);
  const [dateError, setDateError] = useState(false);
  const instances = group.instances.filter((i) => i.result || (i.end && Date.parse(i.end) <= now.getTime()))
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  const shown = all ? instances : instances.slice(0, 8);
  function saveLimit(value?: number) {
    const limits = { ...course.attendanceLimits };
    if (value === undefined) delete limits[group.target.id];
    else limits[group.target.id] = value;
    updateCourse(course.id, { attendanceLimits: limits });
    setEditLimit(false);
  }
  function addClass(event: FormEvent) {
    event.preventDefault();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match || date > today) { setDateError(true); return; }
    const at = budapestInstant([Number(match[1]), Number(match[2]), Number(match[3])], 0, 0).toISOString();
    setResult(course.id, group.target.id, `m:${newId()}`, { state: "pending", at, label: shortDayLabel(new Date(at), locale) });
    setAdding(false);
    setAll(true);
  }
  return <div className="min-w-0 py-5 first:pt-0 last:pb-0">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-lead font-semibold text-heading [overflow-wrap:anywhere]">{group.target.label}</h3>
        <p className={`mt-1 text-lead font-bold tabular-nums ${summary.tone === "danger" ? "text-danger" : summary.tone === "warning" ? "text-warning" : "text-heading"}`}>{t.absences(summary.absences, summary.limit)}</p>
        {summary.remaining !== undefined && <p className={`text-small ${summary.tone === "danger" ? "text-danger" : summary.tone === "warning" ? "text-warning" : "text-muted"}`}>{t.remaining(summary.remaining)}</p>}
        {summary.unrecorded > 0 && <p className="mt-1 text-small text-muted">{t.missing(summary.unrecorded)}</p>}
      </div>
      {group.limitFromRules ? <a href="#course-requirements" className="text-small text-muted underline underline-offset-2 hover:text-heading">{t.fromRules}</a> :
        <Button variant="secondary" size="sm" onClick={() => { setLimit(String(summary.limit ?? 3)); setEditLimit(!editLimit); }}>{summary.limit === undefined ? t.setLimit : t.editLimit}</Button>}
    </div>
    {editLimit && <form className="mt-4 flex flex-col gap-3 rounded-[var(--radius)] bg-inset p-4" onSubmit={(event) => { event.preventDefault(); const n = Number(limit); if (limit.trim() && Number.isInteger(n) && n >= 0 && n <= 200) saveLimit(n); }}>
      <label htmlFor={`${id}-limit`} className="text-small font-semibold text-heading">{t.limitLabel}</label>
      <Input id={`${id}-limit`} type="number" min={0} max={200} required value={limit} onChange={(e) => setLimit(e.target.value)} className="max-w-32" />
      <p className="text-small text-muted">{t.limitHint}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" type="submit">{t.save}</Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setEditLimit(false)}>{t.cancel}</Button>
        {summary.limit !== undefined && <Button size="sm" variant="ghost" type="button" onClick={() => saveLimit()}>{t.noLimit}</Button>}
      </div>
    </form>}
    <details className="mt-4" open={instances.some((i) => !i.result || i.result.state === "pending") || adding || undefined}>
      <summary className="cursor-pointer py-2 text-body font-semibold text-heading">{t.history}</summary>
      {shown.length === 0 ? <p className="py-3 text-small text-muted">{t.noHistory}</p> : <ol className="divide-y divide-border/70">
        {shown.map((instance) => <li key={instance.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 text-small">
            <p className="font-semibold tabular-nums text-heading">{instance.at ? `${shortDayLabel(new Date(instance.at), locale)}${instance.session ? ` · ${budapestTime(new Date(instance.at))}` : ""}` : instance.result?.label ?? instance.key}</p>
            {(!instance.result || instance.result.state === "pending") && <p className="text-muted">{t.unrecorded}</p>}
            {instance.result?.state === "na" && <p className="text-muted">{t.cancelled}</p>}
          </div>
          <AttendanceRecord group={group} instance={instance} />
        </li>)}
      </ol>}
      {instances.length > 8 && <button type="button" className="link-text min-h-10 text-small" onClick={() => setAll(!all)}>{all ? t.hideOlder : t.showOlder}</button>}
    </details>
    {!adding ? <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setAdding(true); setDateError(false); }}><Plus aria-hidden="true" className="h-4 w-4" />{t.add}</Button> :
      <form onSubmit={addClass} className="mt-3 flex flex-col gap-3">
        <label htmlFor={`${id}-date`} className="text-small font-semibold text-heading">{t.date}</label>
        <Input id={`${id}-date`} type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} className="max-w-56" aria-describedby={dateError ? `${id}-error` : undefined} />
        {dateError && <p id={`${id}-error`} role="alert" className="text-small text-danger">{t.invalidDate}</p>}
        <div className="flex gap-2"><Button type="submit" size="sm">{t.add}</Button><Button variant="ghost" size="sm" type="button" onClick={() => setAdding(false)}>{t.cancel}</Button></div>
      </form>}
  </div>;
}

export function AttendanceSection({ course, now }: { course: Course; now: Date }) {
  const t = useT().attendance;
  const groups = useAttendance(course.id);
  const updateCourse = useStore((s) => s.updateCourse);
  return <section aria-labelledby="course-attendance" className="flex scroll-mt-24 flex-col gap-5">
    <SectionHeading id="course-attendance" title={t.title} sub={t.subtitle} />
    <div className="sheet-paper min-w-0 px-4 py-5 sm:px-5">
      <div className="divide-y divide-border/70">{groups.map((group) => <GroupHistory key={group.target.id} group={group} course={course} now={now} />)}</div>
      <div className="mt-4 border-t border-border/70 pt-2"><Switch checked={course.attendanceReminders !== false} onChange={(attendanceReminders) => updateCourse(course.id, { attendanceReminders })} label={t.courseReminders} description={t.courseRemindersHint} /></div>
    </div>
  </section>;
}
