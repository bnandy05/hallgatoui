"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { Link2, Pencil, Plus } from "lucide-react";
import { format } from "date-fns";
import { hu } from "date-fns/locale";
import { useStore } from "@/lib/store";
import { useDedupedDeadlines } from "@/lib/useDedupedDeadlines";
import { getPlatform } from "@/lib/platforms";
import { nextSessionFor } from "@/lib/ical/neptun";
import { formatRelative, nextDeadlineFor, urgencyOf, type Urgency } from "@/lib/radar";
import type { Course, CourseLink } from "@/lib/types";
import { CourseDialog } from "@/components/CourseDialog";
import { LinkEditor } from "@/components/LinkEditor";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Dialog } from "@/components/ui/Dialog";

const URGENCY_TEXT_CLASS: Record<Urgency, string> = {
  overdue: "text-danger",
  critical: "text-danger",
  soon: "text-warning",
  later: "text-muted",
  done: "text-muted",
};

const MAX_LAUNCHERS = 7;

// Shared column template so the header and every row line up.
const WIDE_COLUMNS =
  "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.45fr)_minmax(0,1.7fr)_4.5rem] lg:gap-x-5";
const COLUMNS = `sm:grid sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.5fr)] sm:gap-x-5 ${WIDE_COLUMNS}`;

function Launcher({ link }: { link: CourseLink }) {
  const customPlatforms = useStore((s) => s.customPlatforms);
  const platform = getPlatform(link.platformId, customPlatforms);
  const name = link.label || platform.name;
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${name} megnyitása`}
      title={name}
      className="lift-sm inline-flex rounded-[var(--radius)] hover:shadow-[var(--shadow-paper)] focus-visible:outline-2 focus-visible:outline-accent"
    >
      <PlatformIcon platform={platform} size="md" />
    </a>
  );
}

function CourseRow({ course, now }: { course: Course; now: Date }) {
  const { visible: deadlines } = useDedupedDeadlines();
  const classSessions = useStore((s) => s.classSessions);
  const [editOpen, setEditOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);

  const next = nextDeadlineFor(course.id, deadlines, now);
  const nextClass = nextSessionFor(course.id, classSessions, now);
  const open = deadlines.filter((d) => d.courseId === course.id && !d.done).length;
  const meta = [course.code, course.semester].filter(Boolean).join(" · ");
  const extra = course.links.length - MAX_LAUNCHERS;

  return (
    <li className={`relative flex flex-col gap-3 py-4 pl-5 pr-24 transition-colors duration-150 hover:bg-black/[0.05]/60 sm:items-start lg:items-center lg:pr-5 ${COLUMNS}`}>
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden="true" className="relative mt-[5px] h-[11px] w-[11px] shrink-0">
          <span className="pin left-0 top-0" style={{ "--pin-color": course.color } as CSSProperties} />
        </span>
        <div className="min-w-0">
          <Link
            href={`/targy/${course.id}`}
            className="block truncate text-[16px] font-bold text-heading hover:underline"
          >
            {course.name}
          </Link>
          {meta && <p className="truncate text-[12.5px] tabular-nums text-muted-dim">{meta}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-[23px] sm:pl-0">
        {course.links.slice(0, MAX_LAUNCHERS).map((link) => (
          <Launcher key={link.id} link={link} />
        ))}
        {extra > 0 && (
          <Link
            href={`/targy/${course.id}`}
            className="inline-flex h-7 items-center rounded-[var(--radius)] border border-border px-1.5 text-[12px] font-semibold text-muted hover:border-border-strong hover:text-heading"
          >
            +{extra}
          </Link>
        )}
        <button
          type="button"
          onClick={() => setLinksOpen(true)}
          aria-label={course.links.length > 0 ? `Linkek szerkesztése – ${course.name}` : `Link hozzáadása – ${course.name}`}
          title={course.links.length > 0 ? "Linkek szerkesztése" : "Link hozzáadása"}
          className="inline-flex h-7 items-center gap-1 rounded-[var(--radius)] border border-dashed border-border-strong px-1.5 text-[12px] font-medium text-muted transition-colors hover:border-accent hover:text-heading"
        >
          {course.links.length > 0 ? <Link2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {course.links.length === 0 && "Link"}
        </button>
      </div>

      <div className="min-w-0 pl-[23px] sm:col-span-2 lg:col-span-1 lg:pl-0">
        {next ? (
          <p className="min-w-0 text-[14px]">
            <span className="block truncate font-medium text-foreground">{next.title}</span>
            <span className={`text-[12.5px] font-semibold ${URGENCY_TEXT_CLASS[urgencyOf(next, now)]}`}>
              {formatRelative(new Date(next.due), now)}
            </span>
          </p>
        ) : (
          <p className="text-[13px] text-muted-dim">Nincs közelgő határidő</p>
        )}
        {nextClass && (
          <p className="mt-0.5 truncate text-[12px] text-muted-dim">
            Óra: {format(new Date(nextClass.start), "EEE HH:mm", { locale: hu })}
            {nextClass.room && ` · ${nextClass.room}`}
          </p>
        )}
      </div>

      <div className="absolute right-4 top-4 flex items-center gap-2 lg:static lg:justify-self-end">
        <span
          title="Nyitott határidők"
          className={`min-w-[1.75rem] rounded-full px-1.5 py-0.5 text-center text-[12px] font-semibold tabular-nums ${
            open > 0 ? "bg-canary text-heading" : "text-muted-dim"
          }`}
        >
          {open}
        </span>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          aria-label={`${course.name} szerkesztése`}
          className="rounded-[var(--radius)] p-1.5 text-muted hover:bg-black/[0.06] hover:text-heading focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      <CourseDialog open={editOpen} onClose={() => setEditOpen(false)} course={course} />
      <Dialog open={linksOpen} onClose={() => setLinksOpen(false)} title={`Linkek – ${course.name}`}>
        <LinkEditor courseId={course.id} />
      </Dialog>
    </li>
  );
}

/** Every course as one row on a pinned sheet: launch its platforms without opening it, see what's next. */
export function CourseTable({ courses, now }: { courses: Course[]; now: Date }) {
  return (
    <div className="sheet-paper relative">
      <span aria-hidden="true" className="pin -top-[4px] left-4" style={{ "--pin-color": "var(--border-strong)" } as CSSProperties} />
      <span aria-hidden="true" className="pin -top-[4px] right-4" style={{ "--pin-color": "var(--border-strong)" } as CSSProperties} />
      <div
        aria-hidden="true"
        className={`hidden border-b border-border px-5 pb-2.5 pt-4 text-[12.5px] font-semibold text-muted-dim lg:grid ${WIDE_COLUMNS}`}
      >
        <span>Tárgy</span>
        <span>Platformok</span>
        <span>Következő határidő</span>
        <span className="text-right">Nyitott</span>
      </div>
      <ul className="divide-y divide-border/70">
        {courses.map((course) => (
          <CourseRow key={course.id} course={course} now={now} />
        ))}
      </ul>
    </div>
  );
}
