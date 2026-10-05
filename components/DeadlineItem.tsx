"use client";

import { useState, type ReactNode } from "react";
import { format } from "date-fns";
import { hu } from "date-fns/locale";
import { Check, ExternalLink, Flame, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { getPlatform } from "@/lib/platforms";
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

const URGENCY_LABEL: Partial<Record<string, string>> = {
  overdue: "Lejárt",
  critical: "Kritikus",
  soon: "Hamarosan",
};

const URGENCY_COLOR: Partial<Record<string, string>> = {
  overdue: "var(--danger)",
  critical: "var(--danger)",
  soon: "var(--warning)",
};

/** One labelled line on the slip, ruled off from the next like a form on paper. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 border-t border-wash/[0.08] py-2.5 text-[14px]">
      <dt className="text-[13px] text-muted">{label}</dt>
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
  const course = useStore((s) => s.courses.find((c) => c.id === deadline.courseId));
  const courses = useStore((s) => s.courses);
  const customPlatforms = useStore((s) => s.customPlatforms);
  const toggleDone = useStore((s) => s.toggleDone);
  const updateDeadline = useStore((s) => s.updateDeadline);
  const removeDeadline = useStore((s) => s.removeDeadline);
  const removeDeadlines = useStore((s) => s.removeDeadlines);
  const siblings = useStore((s) =>
    deadline.seriesId ? s.deadlines.filter((d) => d.seriesId === deadline.seriesId) : null
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [now] = useState(() => new Date());

  const due = new Date(deadline.due);
  const urgency = urgencyOf(deadline, now);
  const hot = urgency === "overdue" || urgency === "critical";
  const platform = deadline.platformId ? getPlatform(deadline.platformId, customPlatforms) : null;
  const badgeLabel = URGENCY_LABEL[urgency];
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
    } else if (confirm("Biztosan törlöd?")) {
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
        <p className="text-[17px] font-semibold tabular-nums text-heading first-letter:uppercase">
          {format(due, "EEEE, MMM d. HH:mm", { locale: hu })}
        </p>
        <p className={`text-[14.5px] ${hot && !deadline.done ? "font-semibold text-danger" : "text-muted"}`}>
          {deadline.done ? "Kész" : formatRelative(due, now)}
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
          <p className="text-[13px] tabular-nums text-muted">
            Sorozat: {seriesPosition}/{ordered.length}
          </p>
        )}
        {(badgeLabel || changed || !manual) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {badgeLabel && badgeColor && !deadline.done && <Badge color={badgeColor}>{badgeLabel}</Badge>}
            {changed && deadline.previousDue && (
              <span
                title={`Korábbi határidő: ${format(new Date(deadline.previousDue), "yyyy. MMM d. HH:mm", { locale: hu })}`}
              >
                <Badge color="var(--warning)">módosult</Badge>
              </span>
            )}
            {!manual && <Badge color="var(--muted)">Naptárból</Badge>}
          </div>
        )}
      </div>

      <dl>
        <Row label="Tárgy">
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
              aria-label="Tárgy hozzárendelése"
              value=""
              onChange={(e) =>
                updateDeadline(deadline.id, {
                  courseId: e.target.value || null,
                  ...(e.target.value && { title: cleanCanvasTitle(deadline.title) }),
                })
              }
              className="!w-auto max-w-full !py-1.5"
            >
              <option value="">Nincs tárgy</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          ) : (
            <span className="text-muted">Nincs tárgy</span>
          )}
        </Row>
        {(platform || deadline.url) && (
          <Row label="Platform">
            {platform && (
              <span className="inline-flex items-center gap-2">
                <PlatformIcon platform={platform} size="sm" />
                {platform.name}
              </span>
            )}
            {deadline.url && (
              <a
                href={deadline.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-heading underline"
              >
                Megnyitás
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </Row>
        )}
        <DuplicateRow deadline={deadline} />
        {deadline.note && (
          <Row label="Megjegyzés">
            <p className={`text-foreground ${!manual ? "line-clamp-6" : ""} whitespace-pre-line`}>{deadline.note}</p>
          </Row>
        )}
      </dl>

      <DialogActions>
        {manual && (
          <Button type="button" variant="ghost" onClick={handleDelete} className="text-danger hover:!bg-danger/10 sm:mr-auto">
            <Trash2 className="h-4 w-4" />
            Törlés
          </Button>
        )}
        {manual && (
          <Button type="button" variant="secondary" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Szerkesztés
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
          {deadline.critical ? "Kritikus" : "Megjelölés kritikusként"}
        </Button>
        <Button
          type="button"
          variant={deadline.done ? "secondary" : "primary"}
          onClick={() => toggleDone(deadline.id)}
        >
          {deadline.done ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {deadline.done ? "Mégsem kész" : "Kész"}
        </Button>
      </DialogActions>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Törlés a sorozatból">
        <p className="text-[14.5px] text-foreground">
          Ez a határidő egy sorozat tagja ({ordered?.length} határidő). Mit törölsz?
        </p>
        <DialogActions>
          <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>
            Mégse
          </Button>
          <Button type="button" variant="secondary" onClick={() => deleteWith([deadline.id])}>
            Csak ezt
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => deleteWith(laterIds)}
            disabled={laterIds.length < 2}
          >
            Ezt és a későbbieket ({laterIds.length})
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

/** "Források" row, only when other sources report the same deadline. */
function DuplicateRow({ deadline }: { deadline: Deadline }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 border-t border-wash/[0.08] py-2.5 text-[14px] [&:not(:has(button))]:hidden">
      <dt className="text-[13px] text-muted">Források</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2">
        <DuplicateSources deadline={deadline} />
      </dd>
    </div>
  );
}
