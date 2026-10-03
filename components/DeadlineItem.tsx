"use client";

import { useState } from "react";
import { format } from "date-fns";
import { hu } from "date-fns/locale";
import { ExternalLink, Flame, Pencil, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { getPlatform } from "@/lib/platforms";
import { cleanCanvasTitle } from "@/lib/ical/canvas";
import { formatRelative, isRecentlyChanged, urgencyOf } from "@/lib/radar";
import type { Deadline } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { PlatformIcon } from "@/components/PlatformIcon";
import { DeadlineDialog } from "@/components/DeadlineDialog";

export interface DeadlineItemProps {
  deadline: Deadline;
  compact?: boolean;
}

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

export function DeadlineItem({ deadline, compact = false }: DeadlineItemProps) {
  const course = useStore((s) => s.courses.find((c) => c.id === deadline.courseId));
  const courses = useStore((s) => s.courses);
  const customPlatforms = useStore((s) => s.customPlatforms);
  const toggleDone = useStore((s) => s.toggleDone);
  const updateDeadline = useStore((s) => s.updateDeadline);
  const removeDeadline = useStore((s) => s.removeDeadline);
  const [editOpen, setEditOpen] = useState(false);

  const now = new Date();
  const due = new Date(deadline.due);
  const urgency = urgencyOf(deadline, now);
  const platform = deadline.platformId
    ? getPlatform(deadline.platformId, customPlatforms)
    : null;
  const badgeLabel = URGENCY_LABEL[urgency];
  const badgeColor = URGENCY_COLOR[urgency];

  function handleDelete() {
    if (confirm("Biztosan törlöd?")) {
      removeDeadline(deadline.id);
    }
  }

  function toggleCritical() {
    updateDeadline(deadline.id, { critical: !deadline.critical });
  }

  return (
    <div
      className={`flex items-start gap-2 rounded-md border border-border bg-card transition-colors duration-150 hover:border-border-strong ${
        compact ? "px-2 py-1.5" : "px-3 py-2"
      }`}
    >
      <input
        type="checkbox"
        checked={deadline.done}
        onChange={() => toggleDone(deadline.id)}
        aria-label={deadline.done ? "Megjelölés nem késznek" : "Megjelölés késznek"}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-accent"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`min-w-0 max-w-full truncate text-sm font-medium ${
              deadline.done ? "text-muted line-through" : "text-foreground"
            }`}
          >
            {deadline.title}
          </span>
          {deadline.url && (
            <a
              href={deadline.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Megnyitás"
              className="text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {deadline.source === "ical" && (
            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted">
              iCal
            </span>
          )}
          {badgeLabel && badgeColor && <Badge color={badgeColor}>{badgeLabel}</Badge>}
          {deadline.previousDue && isRecentlyChanged(deadline, now) && (
            <span
              title={`Korábbi határidő: ${format(new Date(deadline.previousDue), "yyyy. MMM d. HH:mm", { locale: hu })}`}
            >
              <Badge color="var(--warning)">módosult</Badge>
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {course && (
            <span className="inline-flex items-center gap-1">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: course.color }}
              />
              {course.name}
            </span>
          )}
          {!compact && !course && deadline.source === "ical" && deadline.courseId === null && (
            <Select
              aria-label="Tárgy hozzárendelése"
              value=""
              onChange={(e) =>
                updateDeadline(deadline.id, {
                  courseId: e.target.value || null,
                  ...(e.target.value && { title: cleanCanvasTitle(deadline.title) }),
                })
              }
              className="h-6 w-auto max-w-[10rem] px-1.5 py-0 text-xs"
            >
              <option value="">Nincs tárgy</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          {platform && <PlatformIcon platform={platform} size="sm" />}
          <span>{format(due, "MMM d. (EEE) HH:mm", { locale: hu })}</span>
          <span>· {formatRelative(due, now)}</span>
        </div>
        {!compact && deadline.note && (
          <p
            className={`mt-1 text-sm text-muted ${
              deadline.source === "ical" ? "line-clamp-3 whitespace-pre-line" : ""
            }`}
          >
            {deadline.note}
          </p>
        )}
      </div>

      {!compact && (
        <div className="flex shrink-0 items-center gap-0.5">
          {deadline.source === "manual" ? (
            <>
              <button
                type="button"
                aria-label="Szerkesztés"
                onClick={() => setEditOpen(true)}
                className="rounded-md p-1 text-muted hover:bg-inset focus-visible:outline-2 focus-visible:outline-accent"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Törlés"
                onClick={handleDelete}
                className="rounded-md p-1 text-muted hover:bg-inset focus-visible:outline-2 focus-visible:outline-accent"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              aria-label={
                deadline.critical ? "Kritikus jelölés eltávolítása" : "Megjelölés kritikusnak"
              }
              onClick={toggleCritical}
              className={`rounded-md p-1 hover:bg-inset focus-visible:outline-2 focus-visible:outline-accent ${
                deadline.critical ? "text-danger" : "text-muted"
              }`}
            >
              <Flame className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {deadline.source === "manual" && (
        <DeadlineDialog open={editOpen} onClose={() => setEditOpen(false)} deadline={deadline} />
      )}
    </div>
  );
}
