"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { Link2, Pencil, Plus } from "lucide-react";
import { format } from "date-fns";
import { useStore } from "@/lib/store";
import { dateLocale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { useDedupedDeadlines } from "@/lib/useDedupedDeadlines";
import { getPlatform, platformName } from "@/lib/platforms";
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

const MAX_LAUNCHERS = 6;

function Launcher({ link }: { link: CourseLink }) {
  const t = useT();
  const customPlatforms = useStore((s) => s.customPlatforms);
  const platform = getPlatform(link.platformId, customPlatforms);
  const name = link.label || platformName(platform, t.platforms.other);
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.courseCard.openPlatform(name)}
      title={name}
      className="lift-sm inline-flex rounded-[var(--radius)] p-0.5 hover:shadow-[var(--shadow-paper)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:p-1"
    >
      <PlatformIcon platform={platform} size="md" />
    </a>
  );
}

/** One course as an index card pinned to the board: what's next, and its platforms one tap away. */
function CourseCard({ course, now, index }: { course: Course; now: Date; index: number }) {
  const t = useT();
  const locale = useLocale();
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
    <li className="slip flex min-w-0 flex-col bg-card px-4 pb-3.5 pt-4" style={{ "--i": index } as CSSProperties}>
      <span aria-hidden="true" className="pin -top-[4px] left-4" style={{ "--pin-color": course.color } as CSSProperties} />

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/targy/${course.id}`}
            className="line-clamp-2 text-[16px] font-bold leading-snug text-heading [overflow-wrap:anywhere] hover:underline"
          >
            {course.name}
          </Link>
          {meta && <p className="mt-0.5 truncate text-[12.5px] tabular-nums text-muted-dim">{meta}</p>}
        </div>
        <span
          title={t.courseCard.openDeadlines}
          aria-label={t.courseCard.openDeadlinesAria(open)}
          className={`mt-0.5 min-w-[1.6rem] shrink-0 rounded-full px-1.5 py-0.5 text-center text-[12px] font-semibold tabular-nums ${
            open > 0 ? "bg-canary text-heading" : "text-muted-dim"
          }`}
        >
          {open}
        </span>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          aria-label={t.courseCard.edit(course.name)}
          className="-mr-1.5 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted hover:bg-wash/[0.06] hover:text-heading focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 min-w-0 border-t border-border/70 pt-3 text-[14px]">
        {next ? (
          <>
            <p className="truncate font-medium text-foreground" title={next.title}>
              {next.title}
            </p>
            <p className={`text-[12.5px] font-semibold ${URGENCY_TEXT_CLASS[urgencyOf(next, now)]}`}>
              {formatRelative(new Date(next.due), now, dateLocale(locale))}
            </p>
          </>
        ) : (
          <p className="text-[13px] text-muted-dim">{t.courseCard.noUpcoming}</p>
        )}
        {nextClass && (
          <p className="mt-1 truncate text-[12px] text-muted-dim">
            {t.courseCard.classLabel}: {format(new Date(nextClass.start), "EEE HH:mm", { locale: dateLocale(locale) })}
            {nextClass.room && ` · ${nextClass.room}`}
          </p>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1 pt-3">
        {course.links.slice(0, MAX_LAUNCHERS).map((link) => (
          <Launcher key={link.id} link={link} />
        ))}
        {extra > 0 && (
          <Link
            href={`/targy/${course.id}`}
            aria-label={t.courseCard.moreLinks(extra, course.name)}
            className="inline-flex h-7 items-center rounded-[var(--radius)] border border-border px-1.5 text-[12px] font-semibold text-muted hover:border-border-strong hover:text-heading"
          >
            +{extra}
          </Link>
        )}
        <button
          type="button"
          onClick={() => setLinksOpen(true)}
          aria-label={course.links.length > 0 ? t.courseCard.editLinksFor(course.name) : t.courseCard.addLinkFor(course.name)}
          title={course.links.length > 0 ? t.courseCard.editLinks : t.courseCard.addLink}
          className="ml-0.5 inline-flex h-7 items-center gap-1 rounded-[var(--radius)] border border-dashed border-border-strong px-1.5 text-[12px] font-medium text-muted transition-colors hover:border-accent hover:text-heading pointer-coarse:h-9 pointer-coarse:px-2.5"
        >
          {course.links.length > 0 ? <Link2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {course.links.length === 0 && t.courseCard.link}
        </button>
      </div>

      <CourseDialog open={editOpen} onClose={() => setEditOpen(false)} course={course} />
      <Dialog open={linksOpen} onClose={() => setLinksOpen(false)} title={t.courseCard.linksTitle(course.name)}>
        <LinkEditor courseId={course.id} />
      </Dialog>
    </li>
  );
}

/** Every course as an index card on the felt: launch its platforms without opening it, see what's next. */
export function CourseTable({ courses, now }: { courses: Course[]; now: Date }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(16.5rem,1fr))] gap-x-4 gap-y-5">
      {courses.map((course, i) => (
        <CourseCard key={course.id} course={course} now={now} index={i} />
      ))}
    </ul>
  );
}
