"use client";

import { useMemo, useState } from "react";
import { Archive, ChevronRight, Download, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { evaluate } from "@/lib/rules/engine";
import type { RequirementResult, RequirementRules } from "@/lib/rules/types";
import { hasSemesterContent, MAX_SEMESTER_NAME } from "@/lib/semesterArchive";
import type { Course, SemesterArchive } from "@/lib/types";
import { downloadBackup } from "@/lib/downloadBackup";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { showToast } from "@/components/ui/Toast";

const NO_ARCHIVES: SemesterArchive[] = [];
const disclosure = "group flex cursor-pointer list-none items-center gap-2 py-3 [&::-webkit-details-marker]:hidden";

export function SemesterArchiveSettings() {
  const t = useT();
  const locale = useLocale();
  const number = useStore((s) => s.semesterNumber ?? 0);
  const hasContent = useStore(hasSemesterContent);
  const archives = useStore((s) => s.semesterArchives ?? NO_ARCHIVES);
  const archiveSemester = useStore((s) => s.archiveCurrentSemester);
  const removeArchive = useStore((s) => s.removeSemesterArchive);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const { confirm, dialog } = useConfirm();

  function archive() {
    if (!archiveSemester(name)) return;
    setOpen(false);
    showToast({ message: t.data.archive.created(name.trim()) });
  }

  async function remove(entry: SemesterArchive) {
    const ok = await confirm({
      title: t.data.archive.removeTitle(entry.name),
      message: t.data.archive.removeHint,
      confirmLabel: t.common.delete,
    });
    if (ok) removeArchive(entry.number);
  }

  return (
    <section className="sheet-paper px-5 py-4 sm:px-6" aria-labelledby="semester-archive-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <h3 id="semester-archive-heading" className="font-display text-subhead text-heading">{t.data.archive.title}</h3>
          <p className="mt-1 text-small text-muted">{t.data.archive.hint}</p>
        </div>
        {hasContent && (
          <Button type="button" variant="secondary" size="sm" onClick={() => {
            setName(t.data.archive.defaultName(number + 1));
            setOpen(true);
          }}>
            <Archive className="h-4 w-4" aria-hidden />
            {t.data.archive.action}
          </Button>
        )}
      </div>

      {archives.length === 0 ? (
        <p className="mt-4 border-t border-border pt-3 text-small text-muted">{t.data.archive.empty}</p>
      ) : (
        <div className="mt-3 divide-y divide-border border-t border-border">
          {archives.slice().reverse().map((entry) => (
            <ArchiveEntry
              key={entry.number}
              entry={entry}
              formattedDate={new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(entry.archivedAt))}
              onDownload={() => downloadBackup({
                version: 1, customPlatforms: useStore.getState().customPlatforms, ...entry.data,
              }, `hallgatoi-reteg-semester-${entry.number + 1}.json`)}
              onRemove={() => void remove(entry)}
            />
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={t.data.archive.action}>
        <form onSubmit={(event) => { event.preventDefault(); archive(); }} className="flex flex-col gap-4">
          <p className="text-body text-muted">{t.data.archive.explain}</p>
          <div>
            <Label htmlFor="semester-archive-name">{t.data.archive.name}</Label>
            <Input id="semester-archive-name" value={name} maxLength={MAX_SEMESTER_NAME} required onChange={(event) => setName(event.target.value)} />
          </div>
          <DialogActions>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>{t.common.cancel}</Button>
            <Button type="submit" disabled={!name.trim() || !hasContent}>{t.data.archive.action}</Button>
          </DialogActions>
        </form>
      </Dialog>
      {dialog}
    </section>
  );
}

function ArchiveEntry({ entry, formattedDate, onDownload, onRemove }: {
  entry: SemesterArchive;
  formattedDate: string;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const { courses, requirementResults, requirementRules } = entry.data;
  const resultsByCourse = useMemo(() => {
    const groups = new Map<string, RequirementResult[]>();
    for (const result of requirementResults) {
      const group = groups.get(result.courseId);
      if (group) group.push(result);
      else groups.set(result.courseId, [result]);
    }
    return groups;
  }, [requirementResults]);

  return (
    <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className={disclosure}>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted group-open:rotate-90" aria-hidden />
        <span className="min-w-0 flex-1 break-words text-body font-semibold text-heading">{entry.name}</span>
        <span className="text-small text-muted">{formattedDate}</span>
      </summary>
      {expanded && (
        <div className="pb-4 pl-6">
          <p className="text-small text-muted">{t.data.archive.courseCount(courses.length)} · {t.counts.deadlines(entry.data.deadlines.length)}</p>
          <ul className="mt-2 divide-y divide-border/70">
            {courses.map((course) => (
              <li key={course.id}>
                <ArchivedCourse
                  course={course}
                  rules={requirementRules.find((item) => item.courseId === course.id)}
                  results={resultsByCourse.get(course.id) ?? []}
                  archivedAt={entry.archivedAt}
                />
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onDownload}>
              <Download className="h-4 w-4" aria-hidden />{t.data.archive.download}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-danger" onClick={onRemove}>
              <Trash2 className="h-4 w-4" aria-hidden />{t.data.archive.remove}
            </Button>
          </div>
        </div>
      )}
    </details>
  );
}

function ArchivedCourse({ course, rules, results, archivedAt }: {
  course: Course;
  rules?: RequirementRules;
  results: RequirementResult[];
  archivedAt: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className={disclosure}>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted group-open:rotate-90" aria-hidden />
        <span className="break-words text-body font-semibold text-heading">{course.name}</span>
        {course.code && <span className="text-fine text-muted">{course.code}</span>}
      </summary>
      {open && <CourseHistory course={course} rules={rules} results={results} archivedAt={archivedAt} />}
    </details>
  );
}

function CourseHistory({ course, rules, results, archivedAt }: {
  course: Course;
  rules?: RequirementRules;
  results: RequirementResult[];
  archivedAt: string;
}) {
  const t = useT();
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 10 });
  const outcomes = useMemo(() => rules ? evaluate(rules, results, new Date(archivedAt), locale).outcomes : [], [rules, results, archivedAt, locale]);
  const labels = new Map([...(rules?.components ?? []), ...(rules?.retakes ?? [])].map((item) => [item.id, item.label]));
  const links = [
    ...course.links.map((link) => ({ ...link, title: link.label || link.platformId })),
    ...course.resources,
  ];

  function score(result: RequirementResult): string {
    const value = result.value;
    if (result.state === "pending") return t.data.archive.pending;
    if (result.state === "na" || !value) return t.data.archive.notApplicable;
    switch (value.kind) {
      case "points":
      case "bonus": return t.rulesPanel.figurePoints(number.format(value.points));
      case "grade": return number.format(value.grade);
      case "pm": return value.sign;
      case "quiz": return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(value.bestPercent / 100);
      case "attendance": return t.instanceInput[value.status];
      case "assignment": {
        const component = rules?.components.find((item) => item.id === result.componentId);
        return component?.kind === "assignment"
          ? (component.outcomes.find((outcome) => outcome.id === value.outcome)?.label ?? value.outcome)
          : value.outcome;
      }
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-4 pl-5 text-small text-muted">
      {outcomes.length > 0 && (
        <dl className="divide-y divide-border/70">
          {outcomes.map((outcome) => {
            const grade = (g: number) => g === 0 ? t.rulesPanel.noGrade : String(g);
            const text = outcome.status === "final" || outcome.worst === outcome.best
              ? grade(outcome.current ?? outcome.worst)
              : `${grade(outcome.worst)} – ${grade(outcome.best)}`;
            return (
              <div key={outcome.outcomeId} className="flex justify-between gap-2 py-1">
                <dt>{outcome.label}</dt>
                <dd className="text-right font-semibold text-heading">{text}</dd>
              </div>
            );
          })}
        </dl>
      )}
      {results.length > 0 && (
        <div>
          <p className="font-semibold text-heading">{t.data.archive.results}</p>
          <dl className="mt-1 divide-y divide-border/70">
            {results.map((result) => (
              <div key={result.id} className="flex justify-between gap-2 py-1">
                <dt className="min-w-0 break-words">{labels.get(result.componentId) ?? result.componentId}{result.label && ` · ${result.label}`}</dt>
                <dd className="shrink-0 text-right font-semibold text-heading">{score(result)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {links.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {links.map((link) => <li key={link.id}><a className="link-text" href={link.url} target="_blank" rel="noreferrer">{link.title}</a></li>)}
        </ul>
      )}
      {outcomes.length === 0 && results.length === 0 && links.length === 0 && <p>{t.data.archive.noCourseHistory}</p>}
    </div>
  );
}
