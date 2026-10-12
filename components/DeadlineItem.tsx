"use client";

import { useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { Check, ExternalLink, Flame, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { getPlatform, platformName } from "@/lib/platforms";
import { dateLocale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { cleanCanvasTitle } from "@/lib/ical/canvas";
import { formatRelative, isRecentlyChanged, urgencyOf } from "@/lib/radar";
import type { Deadline } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { PlatformIcon } from "@/components/PlatformIcon";
import { DeadlineDialog } from "@/components/DeadlineDialog";
import { DuplicateSources } from "@/components/DuplicateSources";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const URGENCY_COLOR: Partial<Record<string, string>> = {
  overdue: "var(--danger)",
  critical: "var(--danger)",
  soon: "var(--warning)",
};

/** One labelled line on the slip, ruled off from the next like a form on paper. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 border-t border-wash/[0.08] py-2.5 text-body">
      <dt className="text-small text-muted">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2">{children}</dd>
    </div>
  );
}

export interface DeadlineDetailDialogProps {
  deadline: Deadline;
  open: boolean;
  onClose: () => void;
}

/**
 * A deadline taken down from the board: the dialog is the slip itself, enlarged. Its pin
 * carries the state, an overdue slip is printed on salmon, and the actions are spelled out.
 */
export function DeadlineDetailDialog({ deadline, open, onClose }: DeadlineDetailDialogProps) {
  const course = useStore((s) => s.courses.find((c) => c.id === deadline.courseId));
  const [editOpen, setEditOpen] = useState(false);
  const urgency = urgencyOf(deadline, new Date());
  const hot = urgency === "overdue" || urgency === "critical";

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        size="lg"
        tone={urgency === "overdue" ? "salmon" : "paper"}
        pinColor={deadline.done ? undefined : hot ? "var(--pin)" : (course?.color ?? "var(--pin-neutral)")}
        title={
          <span className="strike" data-done={deadline.done}>
            {deadline.title}
          </span>
        }
      >
        <DeadlineDetail
          deadline={deadline}
          onClose={onClose}
          onEdit={() => {
            onClose();
            setEditOpen(true);
          }}
        />
      </Dialog>
      {deadline.source === "manual" && (
        <DeadlineDialog open={editOpen} onClose={() => setEditOpen(false)} deadline={deadline} />
      )}
    </>
  );
}

function DeadlineDetail({
  deadline,
  onClose,
  onEdit,
}: {
  deadline: Deadline;
  onClose: () => void;
  onEdit: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const dl = dateLocale(locale);
  const course = useStore((s) => s.courses.find((c) => c.id === deadline.courseId));
  const courses = useStore((s) => s.courses);
  const customPlatforms = useStore((s) => s.customPlatforms);
  const toggleDone = useStore((s) => s.toggleDone);
  const updateDeadline = useStore((s) => s.updateDeadline);
  const removeDeadline = useStore((s) => s.removeDeadline);
  const removeDeadlines = useStore((s) => s.removeDeadlines);
  // Filtered outside the selector: a selector that returns a new array every time loops forever.
  const deadlines = useStore((s) => s.deadlines);
  const siblings = useMemo(
    () => (deadline.seriesId ? deadlines.filter((d) => d.seriesId === deadline.seriesId) : null),
    [deadlines, deadline.seriesId]
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [now] = useState(() => new Date());

  const due = new Date(deadline.due);
  const urgency = urgencyOf(deadline, now);
  const hot = urgency === "overdue" || urgency === "critical";
  const platform = deadline.platformId ? getPlatform(deadline.platformId, customPlatforms) : null;
  const badgeLabel = { overdue: t.week.overdue, critical: t.common.critical, soon: t.deadlineDetail.soon }[urgency as "overdue" | "critical" | "soon"];
  const badgeColor = URGENCY_COLOR[urgency];
  const changed = deadline.previousDue && isRecentlyChanged(deadline, now);
  const left = due.getTime() - now.getTime();
  const share = !deadline.done && left > 0 ? Math.min(1, left / WEEK_MS) : 0;
  const manual = deadline.source === "manual";

  // Position within the series, by due date; only shown while others of it remain.
  const ordered = siblings && siblings.length > 1
    ? [...siblings].sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id))
    : null;
  const seriesPosition = ordered ? ordered.findIndex((d) => d.id === deadline.id) + 1 : 0;
  const laterIds = ordered ? ordered.filter((d) => d.due >= deadline.due).map((d) => d.id) : [];

  function handleDelete() {
    if (ordered) {
      setDeleteOpen(true);
    } else if (confirm(t.deadlineDetail.confirmDelete)) {
      onClose();
      removeDeadline(deadline.id);
    }
  }

  function deleteWith(ids: string[]) {
    setDeleteOpen(false);
    onClose();
    removeDeadlines(ids);
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1 pb-4">
        <p className="text-lead font-semibold tabular-nums text-heading first-letter:uppercase">
          {format(due, t.formats.weekdayMonthDayTime, { locale: dl })}
        </p>
        <p className={`text-body ${hot && !deadline.done ? "font-semibold text-danger" : "text-muted"}`}>
          {deadline.done ? t.common.done : formatRelative(due, now, locale)}
        </p>
        {share > 0 && (
          <span aria-hidden="true" className="mt-2 block h-[3px] w-full rounded-full bg-wash/[0.07]">
            <span
              className={`block h-full rounded-full ${hot ? "bg-danger/70" : "bg-heading/30"}`}
              style={{ width: `${share * 100}%` }}
            />
          </span>
        )}
        {ordered && seriesPosition > 0 && (
          <p className="text-small tabular-nums text-muted">
            {t.deadlineDetail.series(seriesPosition, ordered.length)}
          </p>
        )}
        {(badgeLabel || changed || !manual) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {badgeLabel && badgeColor && !deadline.done && <Badge color={badgeColor}>{badgeLabel}</Badge>}
            {changed && deadline.previousDue && (
              <span
                title={t.deadlineDetail.previousDue(format(new Date(deadline.previousDue), t.formats.yearMonthDayTime, { locale: dl }))}
              >
                <Badge color="var(--warning)">{t.week.changed}</Badge>
              </span>
            )}
            {!manual && <Badge color="var(--muted)">{t.deadlineDetail.fromCalendar}</Badge>}
          </div>
        )}
      </div>

      <dl>
        <Row label={t.deadlineDetail.course}>
          {course ? (
            <span className="inline-flex min-w-0 items-center gap-2 font-medium text-heading">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: course.color }}
              />
              <span className="truncate">{course.name}</span>
            </span>
          ) : !manual ? (
            <Select
              aria-label={t.deadlineDetail.assignCourse}
              value=""
              onChange={(e) =>
                updateDeadline(deadline.id, {
                  courseId: e.target.value || null,
                  ...(e.target.value && { title: cleanCanvasTitle(deadline.title) }),
                })
              }
              className="!w-auto max-w-full !py-1.5"
            >
              <option value="">{t.deadlineDetail.noCourse}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          ) : (
            <span className="text-muted">{t.deadlineDetail.noCourse}</span>
          )}
        </Row>
        {(platform || deadline.url) && (
          <Row label={t.deadlineDetail.platform}>
            {platform && (
              <span className="inline-flex items-center gap-2">
                <PlatformIcon platform={platform} size="sm" />
                {platformName(platform, t.platforms.other)}
              </span>
            )}
            {deadline.url && (
              <a
                href={deadline.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 link-text"
              >
                {t.common.open}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </Row>
        )}
        <DuplicateRow deadline={deadline} />
        {deadline.note && (
          <Row label={t.deadlineDetail.note}>
            <p className={`text-foreground ${!manual ? "line-clamp-6" : ""} whitespace-pre-line`}>{deadline.note}</p>
          </Row>
        )}
      </dl>

      <DialogActions>
        {manual && (
          <Button type="button" variant="ghost" onClick={handleDelete} className="text-danger hover:!bg-danger/10 sm:mr-auto">
            <Trash2 className="h-4 w-4" />
            {t.common.delete}
          </Button>
        )}
        {manual && (
          <Button type="button" variant="secondary" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            {t.common.edit}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          aria-pressed={deadline.critical}
          onClick={() => updateDeadline(deadline.id, { critical: !deadline.critical })}
          className={deadline.critical ? "!border-danger text-danger" : ""}
        >
          <Flame className="h-4 w-4" />
          {deadline.critical ? t.common.critical : t.deadlineDetail.markCritical}
        </Button>
        <Button
          type="button"
          variant={deadline.done ? "secondary" : "primary"}
          onClick={() => toggleDone(deadline.id)}
        >
          {deadline.done ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {deadline.done ? t.deadlineDetail.notDone : t.common.done}
        </Button>
      </DialogActions>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t.deadlineDetail.deleteSeriesTitle}>
        <p className="text-body text-foreground">
          {t.deadlineDetail.deleteSeriesText(ordered?.length ?? 0)}
        </p>
        <DialogActions>
          <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>
            {t.common.cancel}
          </Button>
          <Button type="button" variant="secondary" onClick={() => deleteWith([deadline.id])}>
            {t.deadlineDetail.onlyThis}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => deleteWith(laterIds)}
            disabled={laterIds.length < 2}
          >
            {t.deadlineDetail.thisAndLater(laterIds.length)}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

/** "Sources" row, only when other sources report the same deadline. */
function DuplicateRow({ deadline }: { deadline: Deadline }) {
  const t = useT();
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 border-t border-wash/[0.08] py-2.5 text-body [&:not(:has(button))]:hidden">
      <dt className="text-small text-muted">{t.deadlineDetail.sources}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2">
        <DuplicateSources deadline={deadline} />
      </dd>
    </div>
  );
}
