"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, CalendarPlus, Plus, Sparkles } from "lucide-react";
import { addDays, format } from "date-fns";
import { useStore } from "@/lib/store";
import { dateLocale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { useDataReady } from "@/lib/useDataReady";
import { visibleSessions } from "@/lib/ical/neptun";
import { useDedupedDeadlines } from "@/lib/useDedupedDeadlines";
import { formatRelative, isCritical, weekRangeLabel, weekStartOf, weekSummary } from "@/lib/radar";
import type { Deadline } from "@/lib/types";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CourseDialog } from "@/components/CourseDialog";
import { DeadlineDetailDialog } from "@/components/DeadlineItem";
import { DiscoveryBanner } from "@/components/DiscoveryBanner";
import { TimetableBanner } from "@/components/TimetableBanner";
import { Pill } from "@/components/ui/Pill";
import { CourseTable } from "@/components/week/CourseTable";
import { WeekBoard } from "@/components/week/WeekBoard";
import { WeekNav } from "@/components/week/WeekNav";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function HomeSkeleton() {
  return (
    <div className="grid gap-2 lg:grid-cols-7">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="h-16 rounded-[var(--radius-slip)] bg-strip/80 lg:h-60" />
      ))}
    </div>
  );
}

/** The one notice that owns the top of the page: the next open deadline, pinned beside the week. */
function NextNotice({ deadline, now }: { deadline: Deadline; now: Date }) {
  const t = useT();
  const dl = dateLocale(useLocale());
  const course = useStore((s) => s.courses.find((c) => c.id === deadline.courseId));
  const [open, setOpen] = useState(false);
  const critical = isCritical(deadline, now);
  const due = new Date(deadline.due);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="slip group flex w-full shrink-0 flex-col gap-1 bg-card px-4 pb-3.5 pt-4 text-left lg:w-[24rem]"
      >
        <span
          aria-hidden="true"
          className="pin -top-[4px] left-4"
          style={{ "--pin-color": critical ? "var(--pin)" : (course?.color ?? "var(--border-strong)") } as CSSProperties}
        />
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-semibold text-muted-dim">{t.home.next}</span>
          <span className={`font-display text-[22px] tabular-nums ${critical ? "text-danger" : "text-heading"}`}>
            {formatRelative(due, now, dl)}
          </span>
        </span>
        <span className="line-clamp-2 text-[16px] font-semibold leading-snug text-heading [overflow-wrap:anywhere] group-hover:underline">
          {deadline.title.replace(/(\d+\.) /g, "$1\u00a0")}
        </span>
        <span className="truncate text-[13px] text-muted">
          {[course?.name, format(due, "EEEE HH:mm", { locale: dl })].filter(Boolean).join(" · ")}
        </span>
      </button>
      <DeadlineDetailDialog deadline={deadline} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export default function WeekHome() {
  const t = useT();
  const locale = useLocale();
  const hydrated = useDataReady();
  const courses = useStore((s) => s.courses);
  const { visible: deadlines } = useDedupedDeadlines();
  const loadDemo = useStore((s) => s.loadDemo);
  const allSessions = useStore((s) => s.classSessions);
  const timetableSources = useStore((s) => s.timetableSources);
  const classSessions = useMemo(() => visibleSessions(allSessions, timetableSources), [allSessions, timetableSources]);
  const showClasses = useStore((s) => s.showClasses);
  const setShowClasses = useStore((s) => s.setShowClasses);
  const [now] = useState(() => new Date());
  const currentWeekStart = useMemo(() => weekStartOf(now), [now]);
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [courseOpen, setCourseOpen] = useState(false);

  const isCurrent = weekStart.getTime() === currentWeekStart.getTime();
  const summary = useMemo(() => weekSummary(deadlines, now), [deadlines, now]);
  const sortedCourses = useMemo(
    () => [...courses].sort((a, b) => a.name.localeCompare(b.name, locale)),
    [courses, locale]
  );
  const next = useMemo(
    () =>
      deadlines
        .filter((d) => !d.done && new Date(d.due).getTime() >= now.getTime())
        .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())[0],
    [deadlines, now]
  );
  const shownWeekCount = deadlines.filter((d) => {
    const due = new Date(d.due).getTime();
    return !d.done && due >= weekStart.getTime() && due < addDays(weekStart, 7).getTime();
  }).length;
  const nextWeekStart = addDays(weekStart, 7);
  const nextWeekCount = deadlines.filter((d) => {
    const due = new Date(d.due).getTime();
    return !d.done && due >= nextWeekStart.getTime() && due < addDays(nextWeekStart, 7).getTime();
  }).length;

  const range = capitalize(weekRangeLabel(weekStart, dateLocale(locale), t.formats.weekRange));
  const sub = !hydrated ? (
    " "
  ) : isCurrent ? (
    summary.total === 0 ? (
      t.home.noOpenThisWeek
    ) : (
      <>
        {t.home.openUntilWeekEnd(summary.total)}
        {summary.critical > 0 && (
          <>
            {t.home.ofWhich}
            <span className="font-semibold text-danger">{t.home.criticalCount(summary.critical)}</span>
          </>
        )}
        .
      </>
    )
  ) : (
    t.home.openThisWeek(shownWeekCount)
  );

  return (
    <div className="flex flex-col gap-14 sm:gap-20">
      <section className="flex flex-col gap-5" aria-labelledby="week-heading">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
          <SectionHeading as="h1" id="week-heading" title={range} sub={sub} />
          {hydrated && isCurrent && next && <NextNotice deadline={next} now={now} />}
        </div>

        {hydrated && (
          <>
            <DiscoveryBanner />
            <TimetableBanner />
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <WeekNav weekStart={weekStart} currentWeekStart={currentWeekStart} onChange={setWeekStart} />
          {hydrated && classSessions.length > 0 && (
            <Pill active={showClasses} onClick={() => setShowClasses(!showClasses)} title={t.home.classesToggleTitle}>
              <CalendarClock className="h-3.5 w-3.5" />
              {t.home.classesToggle}
            </Pill>
          )}
        </div>

        {!hydrated ? (
          <HomeSkeleton />
        ) : (
          <>
            <WeekBoard
              weekStart={weekStart}
              deadlines={deadlines}
              sessions={showClasses ? classSessions : undefined}
              now={now}
              gutter
              intro
              emptyDay={t.home.emptyDay}
              label={t.home.boardLabel(range)}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-[14px]">
              {deadlines.length === 0 ? (
                <p className="text-muted">
                  {t.home.noDeadlinesYet}{" "}
                  <Link href="/beallitasok#naptarak" className="font-semibold text-heading underline">
                    {t.home.connectCalendar}
                  </Link>
                  {t.home.connectCalendarAfter}
                </p>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => setWeekStart(nextWeekStart)}
                className="inline-flex items-center gap-1.5 font-semibold text-heading hover:underline"
              >
                {t.home.nextWeek(nextWeekCount)}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </section>

      {hydrated && (
        <section className="flex flex-col gap-6" aria-labelledby="courses-heading" style={{ "--seq": 3 } as CSSProperties}>
          <SectionHeading
            id="courses-heading"
            title={t.home.courses}
            actions={
              sortedCourses.length > 0 && (
                <Button type="button" variant="secondary" size="sm" onClick={() => setCourseOpen(true)}>
                  <Plus className="h-4 w-4" />
                  {t.home.newCourse}
                </Button>
              )
            }
          />
          {sortedCourses.length === 0 ? (
            <EmptyState
              icon={CalendarPlus}
              title={t.home.noCourses}
              text={t.home.noCoursesText}
              action={
                <>
                  <Link href="/beallitasok#naptarak" className={buttonClasses()}>
                    <CalendarPlus className="h-4 w-4" />
                    {t.home.linkCalendar}
                  </Link>
                  <Button variant="secondary" onClick={() => setCourseOpen(true)}>
                    <Plus className="h-4 w-4" />
                    {t.home.newCourse}
                  </Button>
                  <Button variant="ghost" onClick={() => loadDemo(locale)}>
                    <Sparkles className="h-4 w-4" />
                    {t.home.tryDemo}
                  </Button>
                </>
              }
            />
          ) : (
            <div>
              <CourseTable courses={sortedCourses} now={now} />
            </div>
          )}
        </section>
      )}

      <CourseDialog open={courseOpen} onClose={() => setCourseOpen(false)} />
    </div>
  );
}
