"use client";

import { useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { Check, ExternalLink, Flame, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { getPlatform, platformName } from "@/lib/platforms";
import { dateLocale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { cleanCanvasTitle } from "@/lib/ical/canvas";
import { addStep, checklistProgress, MAX_CHECKLIST_ITEMS, MAX_CHECKLIST_TEXT, removeStep, renameStep, toggleStep } from "@/lib/checklist";
import { EstimateField } from "@/components/EstimateField";
import { formatEstimate, formatRelative, isRecentlyChanged, urgencyOf } from "@/lib/radar";
import type { Deadline } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { IconButton } from "@/components/ui/IconButton";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { PlatformIcon } from "@/components/PlatformIcon";
import { DeadlineDialog } from "@/components/DeadlineDialog";
import { DuplicateSources } from "@/components/DuplicateSources";
import { useDeadlineUndo } from "@/lib/useDeadlineUndo";
import { useMinuteNow } from "@/lib/useMinuteNow";
import { newId } from "@/lib/id";

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
  const { removeWithUndo } = useDeadlineUndo();
  const toggleDone = useStore((s) => s.toggleDone);
  const updateDeadline = useStore((s) => s.updateDeadline);
  // Filtered outside the selector: a selector that returns a new array every time loops forever.
  const deadlines = useStore((s) => s.deadlines);
  const siblings = useMemo(
    () => (deadline.seriesId ? deadlines.filter((d) => d.seriesId === deadline.seriesId) : null),
    [deadlines, deadline.seriesId]
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const now = useMinuteNow();

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

  async function handleDelete() {
    if (ordered) {
      setDeleteOpen(true);
    } else {
      onClose();
      removeWithUndo([deadline.id]);
    }
  }

  function deleteWith(ids: string[]) {
    setDeleteOpen(false);
    onClose();
    removeWithUndo(ids);
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
        {/* Manual deadlines set it in the form, so the row only shows a value; feed deadlines edit it here. */}
        {(!manual || deadline.estimateMinutes) && (
          <Row label={t.estimate.label}>
            {manual ? (
              <span className="tabular-nums text-foreground">{formatEstimate(deadline.estimateMinutes!, locale)}</span>
            ) : (
              <EstimateField
                hideLabel
                value={deadline.estimateMinutes}
                onChange={(minutes) => updateDeadline(deadline.id, { estimateMinutes: minutes })}
              />
            )}
          </Row>
        )}
        <DuplicateRow deadline={deadline} />
        <ChecklistEditor
          list={deadline.checklist}
          onChange={(checklist) => updateDeadline(deadline.id, { checklist })}
        />
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
          // No undo toast here: the dialog is in the top layer, so the toast would sit behind it,
          // and this button is its own undo.
          onClick={() => toggleDone(deadline.id)}
        >
          {deadline.done ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {deadline.done ? t.deadlineDetail.notDone : t.common.done}
        </Button>
      </DialogActions>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t.deadlineDetail.deleteSeriesTitle}
        pinColor="var(--pin)"
      >
        <p className="text-body text-foreground">
          {t.deadlineDetail.deleteSeriesText(ordered?.length ?? 0)}
        </p>
        <DialogActions>
          <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => deleteWith([deadline.id])}
            className="!border-danger text-danger"
          >
            {t.deadlineDetail.onlyThis}
          </Button>
          <Button
            type="button"
            variant="danger"
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

/** Sub-steps of a deadline, ruled like the rest of the slip. Saves on every change; ticking all steps does not complete the deadline. */
function ChecklistEditor({
  list,
  onChange,
}: {
  list: Deadline["checklist"];
  onChange: (next: Deadline["checklist"]) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const { done, total } = checklistProgress(list);
  const full = total >= MAX_CHECKLIST_ITEMS;

  function add() {
    if (!draft.trim() || full) return;
    onChange(addStep(list, draft, newId()));
    setDraft("");
  }

  return (
    <div className="border-t border-wash/[0.08] py-2.5 text-body">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-small text-muted">{t.checklist.label}</p>
        {total > 0 && (
          <p className="text-small tabular-nums text-muted" aria-label={t.checklist.progress(done, total)}>
            {done}/{total}
          </p>
        )}
      </div>
      <ul className="mt-1.5">
        {(list ?? []).map((item) => (
          <ChecklistRow
            key={item.id}
            text={item.text}
            done={item.done}
            onToggle={() => onChange(toggleStep(list, item.id))}
            onRename={(text) => onChange(renameStep(list, item.id, text))}
            onRemove={() => onChange(removeStep(list, item.id))}
          />
        ))}
      </ul>
      <div className="mt-1.5 flex items-center gap-2 rounded-[var(--radius)] border-2 border-dashed border-border-strong/60 px-2.5 transition-colors hover:border-accent focus-within:border-accent">
        <Plus className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <input
          value={draft}
          maxLength={MAX_CHECKLIST_TEXT}
          disabled={full}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
            if (e.key === "Escape" && draft) {
              e.preventDefault();
              e.stopPropagation();
              setDraft("");
            }
          }}
          aria-label={t.checklist.addAria}
          data-no-autofocus
          placeholder={full ? t.checklist.full(MAX_CHECKLIST_ITEMS) : t.checklist.add}
          className="min-w-0 flex-1 bg-transparent py-2 text-body text-foreground outline-none placeholder:text-muted"
        />
      </div>
    </div>
  );
}

function ChecklistRow({
  text,
  done,
  onToggle,
  onRename,
  onRemove,
}: {
  text: string;
  done: boolean;
  onToggle: () => void;
  onRename: (text: string) => void;
  onRemove: () => void;
}) {
  const t = useT();
  // Local draft while typing; committed on blur or Enter (an emptied text removes the step).
  const [value, setValue] = useState(text);
  const [seen, setSeen] = useState(text);
  if (seen !== text) {
    setSeen(text);
    setValue(text);
  }

  function commit() {
    if (value.trim() === text) return setValue(text);
    onRename(value);
  }

  return (
    <li className="flex items-center gap-2 border-t border-wash/[0.08] first:border-t-0">
      <Checkbox checked={done} onChange={onToggle} aria-label={text} />
      <input
        value={value}
        maxLength={MAX_CHECKLIST_TEXT}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            // preventDefault keeps the native <dialog> from closing; stopPropagation alone does not.
            e.preventDefault();
            e.stopPropagation();
            setValue(text);
          }
        }}
        aria-label={t.checklist.edit}
        data-no-autofocus
        className={`min-w-0 flex-1 bg-transparent py-2 text-body outline-none focus-visible:underline ${
          done ? "text-muted line-through" : "text-foreground"
        }`}
      />
      <IconButton aria-label={t.checklist.remove(text)} tone="danger" onClick={onRemove}>
        <X className="h-4 w-4" />
      </IconButton>
    </li>
  );
}
