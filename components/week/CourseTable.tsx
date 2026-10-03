"use client";

import { useState } from "react";
import Link from "next/link";
import { Link2, Pencil, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { getPlatform } from "@/lib/platforms";
import { formatRelative, nextDeadlineFor, urgencyOf, type Urgency } from "@/lib/radar";
import type { Course, CourseLink } from "@/lib/types";
import { NEW_LAYOUT_BASE } from "@/lib/routes";
import { CourseDialog } from "@/components/CourseDialog";
import { LinkEditor } from "@/components/LinkEditor";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Dialog } from "@/components/ui/Dialog";

const URGENCY_TEXT_CLASS: Record<Urgency, string> = {
  overdue: "text-danger",
  critical: "text-danger",
  soon: "text-warning",
  later: "text-foreground",
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
      className="lift-sm inline-flex rounded-md ring-offset-2 ring-offset-card hover:ring-1 hover:ring-border-strong focus-visible:outline-2 focus-visible:outline-accent"
    >
      <PlatformIcon platform={platform} size="md" />
    </a>
  );
}

function CourseRow({ course, now }: { course: Course; now: Date }) {
  const deadlines = useStore((s) => s.deadlines);
  const [editOpen, setEditOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);

  const next = nextDeadlineFor(course.id, deadlines, now);
  const open = deadlines.filter((d) => d.courseId === course.id && !d.done).length;
  const meta = [course.code, course.semester].filter(Boolean).join(" · ");
  const extra = course.links.length - MAX_LAUNCHERS;

  return (
    <li className={`relative flex flex-col gap-2.5 px-4 py-3.5 sm:items-center ${COLUMNS}`}>
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          aria-hidden="true"
          className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: course.color }}
        />
        <div className="min-w-0">
          <Link
            href={`${NEW_LAYOUT_BASE}/targy/${course.id}`}
            className="block truncate font-bold text-heading hover:text-accent-text hover:underline hover:underline-offset-2"
          >
            {course.name}
          </Link>
          {meta && <p className="truncate text-xs text-muted">{meta}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-5 sm:pl-0">
        {course.links.slice(0, MAX_LAUNCHERS).map((link) => (
          <Launcher key={link.id} link={link} />
        ))}
        {extra > 0 && (
          <Link
            href={`${NEW_LAYOUT_BASE}/targy/${course.id}`}
            className="inline-flex h-7 items-center rounded-md border border-border px-1.5 text-xs text-muted hover:border-border-strong hover:text-foreground"
          >
            +{extra}
          </Link>
        )}
        <button
          type="button"
          onClick={() => setLinksOpen(true)}
          aria-label={course.links.length > 0 ? `Linkek szerkesztése – ${course.name}` : `Link hozzáadása – ${course.name}`}
          title={course.links.length > 0 ? "Linkek szerkesztése" : "Link hozzáadása"}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-border px-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent-text"
        >
          {course.links.length > 0 ? <Link2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {course.links.length === 0 && "Link"}
        </button>
      </div>

      <div className="min-w-0 pl-5 sm:col-span-2 sm:pl-[1.25rem] lg:col-span-1 lg:pl-0">
        {next ? (
          <p className="min-w-0 text-sm">
            <span className="block truncate text-foreground">{next.title}</span>
            <span className={`text-xs ${URGENCY_TEXT_CLASS[urgencyOf(next, now)]}`}>
              {formatRelative(new Date(next.due), now)}
            </span>
          </p>
        ) : (
          <p className="text-xs text-muted-dim">Nincs közelgő határidő.</p>
        )}
      </div>

      <div className="absolute right-3 top-3 flex items-center gap-2 sm:static sm:col-span-2 sm:justify-self-end lg:col-span-1">
        <span
          title="Nyitott határidők"
          className={`min-w-[1.75rem] rounded-full px-1.5 py-0.5 text-center text-[11px] tabular-nums ${
            open > 0 ? "bg-accent-soft text-accent-text" : "text-muted-dim"
          }`}
        >
          {open}
        </span>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          aria-label={`${course.name} szerkesztése`}
          className="rounded-md p-1.5 text-muted hover:bg-inset hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
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

/** Every course as one row: launch its platforms without opening it, see what's next. */
export function CourseTable({ courses, now }: { courses: Course[]; now: Date }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
      <div
        aria-hidden="true"
        className={`hidden border-b border-border bg-inset/60 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted lg:grid ${WIDE_COLUMNS}`}
      >
        <span>Tárgy</span>
        <span>Platformok</span>
        <span>Következő</span>
        <span className="text-right">Nyitott</span>
      </div>
      <ul className="divide-y divide-border/60">
        {courses.map((course) => (
          <CourseRow key={course.id} course={course} now={now} />
        ))}
      </ul>
    </div>
  );
}
