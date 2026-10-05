"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, FileQuestion, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { addDays, format, isSameDay, startOfDay } from "date-fns";
import { hu } from "date-fns/locale";
import { useStore } from "@/lib/store";
import { useDataReady } from "@/lib/useDataReady";
import { useDedupedDeadlines } from "@/lib/useDedupedDeadlines";
import { getPlatform } from "@/lib/platforms";
import { linkHost } from "@/lib/url";
import { nextSessionFor } from "@/lib/ical/neptun";
import { formatRelative, groupByWeek, isCritical, nextDeadlineFor, urgencyOf, weekRangeLabel } from "@/lib/radar";
import type { ClassSession, CourseLink } from "@/lib/types";
import { CourseDialog } from "@/components/CourseDialog";
import { DeadlineDialog } from "@/components/DeadlineDialog";
import { LinkEditor } from "@/components/LinkEditor";
import { PlatformIcon } from "@/components/PlatformIcon";
import { ResourceList } from "@/components/ResourceList";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ClassChip } from "@/components/week/ClassChip";
import { DayAgenda } from "@/components/week/DayAgenda";
import { DeadlineChip } from "@/components/week/DeadlineChip";

function BackLink() {
  return (
    <Link href="/" className="inline-flex w-fit items-center gap-1.5 text-[14px] font-semibold text-muted hover:text-heading">
      <ArrowLeft className="h-4 w-4" />
      Vissza a héthez
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-4 w-28 rounded-[var(--radius)] bg-strip/80" />
      <div className="grid gap-8 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="h-72 rounded-[var(--radius-slip)] bg-strip/80" />
        <div className="h-72 rounded-[var(--radius-slip)] bg-strip/80" />
      </div>
    </div>
  );
}

/** A course link as a launch tile: the platform's mark, its name and where it goes. */
function LaunchTile({ link }: { link: CourseLink }) {
  const customPlatforms = useStore((s) => s.customPlatforms);
  const platform = getPlatform(link.platformId, customPlatforms);
  const name = link.label || platform.name;
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      title={link.url}
      className="lift-sm flex min-w-0 items-center gap-3 rounded-[var(--radius)] border border-border bg-card px-2.5 py-2 hover:border-border-strong hover:shadow-[var(--shadow-paper)] focus-visible:outline-2 focus-visible:outline-accent"
    >
      <PlatformIcon platform={platform} size="md" />
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold text-heading">{name}</span>
        <span className="block truncate text-[12px] text-muted-dim">{linkHost(link.url)}</span>
      </span>
    </a>
  );
}

function Section({
  id,
  title,
  sub,
  actions,
  children,
}: {
  id: string;
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <SectionHeading id={id} title={title} sub={sub} actions={actions} />
      {children}
    </section>
  );
}

/** The course's classes in the coming seven days, one line per day, taped flat. */
function UpcomingClasses({ sessions, now }: { sessions: ClassSession[]; now: Date }) {
  const from = startOfDay(now);
  const to = addDays(from, 7);
  const upcoming = sessions
    .filter((s) => new Date(s.end) >= now && new Date(s.start) < to)
    .sort((a, b) => a.start.localeCompare(b.start));
  if (upcoming.length === 0) {
    return <p className="text-[14px] text-muted">A következő hét napban nincs órája.</p>;
  }
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-3">
      {upcoming.map((s) => {
        const start = new Date(s.start);
        return (
          <li key={s.id} className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-muted first-letter:uppercase">
              {isSameDay(start, now) ? "Ma" : format(start, "EEEE, MMM d.", { locale: hu })}
            </span>
            <ClassChip session={s} showCourse={false} />
          </li>
        );
      })}
    </ul>
  );
}

export function CourseWeekDetail({ id }: { id: string }) {
  const hydrated = useDataReady();
  const course = useStore((s) => s.courses.find((c) => c.id === id));
  const deleteCourse = useStore((s) => s.deleteCourse);
  const { visible: deadlines } = useDedupedDeadlines();
  const classSessions = useStore((s) => s.classSessions);
  const router = useRouter();

  const [now] = useState(() => new Date());
  const [editOpen, setEditOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const courseDeadlines = useMemo(() => deadlines.filter((d) => d.courseId === id), [deadlines, id]);
  const courseSessions = useMemo(() => classSessions.filter((s) => s.courseId === id), [classSessions, id]);
  const open = useMemo(() => courseDeadlines.filter((d) => !d.done), [courseDeadlines]);
  const done = useMemo(
    () => courseDeadlines.filter((d) => d.done).sort((a, b) => b.due.localeCompare(a.due)),
    [courseDeadlines]
  );
  const { overdue, weeks } = useMemo(() => {
    const isOverdue = (d: (typeof open)[number]) => urgencyOf(d, now) === "overdue";
    return {
      overdue: open.filter(isOverdue).sort((a, b) => a.due.localeCompare(b.due)),
      weeks: groupByWeek(open.filter((d) => !isOverdue(d)), now),
    };
  }, [open, now]);

  if (!hydrated || deleting) return <DetailSkeleton />;

  if (!course) {
    return (
      <div className="flex flex-col gap-8">
        <BackLink />
        <EmptyState
          icon={FileQuestion}
          title="A tárgy nem található"
          text="Lehet, hogy törölted, vagy hibás a link."
          action={
            <Link href="/" className={buttonClasses({ variant: "secondary" })}>
              Vissza a héthez
            </Link>
          }
        />
      </div>
    );
  }

  const meta = [course.code, course.semester].filter(Boolean).join(" · ");
  const next = nextDeadlineFor(course.id, deadlines, now);
  const nextClass = nextSessionFor(course.id, courseSessions, now);
  const criticalCount = open.filter((d) => isCritical(d, now)).length;

  function handleDelete() {
    if (!course) return;
    if (confirm("Biztosan törlöd a tárgyat? A kézzel felvett határidői és anyagai is törlődnek.")) {
      setDeleting(true);
      router.push("/");
      deleteCourse(course.id);
    }
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <BackLink />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-10">
        {/* The course's index card, pinned beside its board. */}
        <aside className="lg:sticky lg:top-[88px] lg:self-start">
          <div className="slip flex flex-col gap-5 bg-card px-5 pb-5 pt-6">
            <span
              aria-hidden="true"
              className="pin -top-[5px] left-5 !h-[13px] !w-[13px]"
              style={{ "--pin-color": course.color } as CSSProperties}
            />
            <div>
              <h1 className="font-display break-words text-[clamp(30px,4vw,40px)] text-heading [text-wrap:balance]">
                {course.name}
              </h1>
              {meta && <p className="mt-1.5 text-[13px] tabular-nums text-muted-dim">{meta}</p>}
            </div>

            <dl className="flex flex-col gap-2 border-t border-border/70 pt-4 text-[14px]">
              <div>
                <dt className="sr-only">Nyitott határidők</dt>
                <dd className="text-foreground">
                  {open.length === 0 ? "Nincs nyitott határidő" : `${open.length} nyitott határidő`}
                  {criticalCount > 0 && (
                    <>
                      , ebből <span className="font-semibold text-danger">{criticalCount} kritikus</span>
                    </>
                  )}
                </dd>
              </div>
              {next && (
                <div>
                  <dt className="text-[12.5px] text-muted">Következő határidő</dt>
                  <dd className="font-semibold text-heading">
                    {next.title}
                    <span
                      className={`block text-[13px] ${isCritical(next, now) ? "text-danger" : "font-normal text-muted"}`}
                    >
                      {formatRelative(new Date(next.due), now)}
                    </span>
                  </dd>
                </div>
              )}
              {nextClass && (
                <div>
                  <dt className="text-[12.5px] text-muted">Következő óra</dt>
                  <dd className="font-semibold text-heading first-letter:uppercase">
                    {format(new Date(nextClass.start), "EEEE HH:mm", { locale: hu })}
                    {nextClass.room && <span className="font-normal text-muted">, {nextClass.room}</span>}
                  </dd>
                </div>
              )}
            </dl>

            <div className="flex flex-col gap-2 border-t border-border/70 pt-4">
              {course.links.length > 0 ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))] gap-2 lg:grid-cols-1">
                  {course.links.map((link) => (
                    <LaunchTile key={link.id} link={link} />
                  ))}
                </div>
              ) : (
                <p className="text-[14px] text-muted">Még nincs link. Add hozzá a Canvas, Teams vagy Moodle oldalát.</p>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => setLinksOpen(true)} className="self-start">
                {course.links.length > 0 ? <Link2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {course.links.length > 0 ? "Linkek szerkesztése" : "Link hozzáadása"}
              </Button>
            </div>

            <div className="flex items-center gap-2 border-t border-border/70 pt-4">
              <Button type="button" variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Tárgy szerkesztése
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                className="ml-auto text-danger hover:!bg-danger/10"
              >
                <Trash2 className="h-4 w-4" />
                Törlés
              </Button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-14">
          <Section
            id="course-deadlines"
            title="Határidők"
            actions={
              <Button type="button" size="sm" onClick={() => setDeadlineOpen(true)}>
                <Plus className="h-4 w-4" />
                Új határidő
              </Button>
            }
          >
            {open.length === 0 ? (
              <div className="rounded-[var(--radius)] border-2 border-dashed border-border-strong/60 px-5 py-8 text-center text-[14.5px] text-muted">
                {done.length > 0 ? "Minden határidő kész." : "Ehhez a tárgyhoz még nincs határidő."}
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {overdue.length > 0 && (
                  <section
                    aria-labelledby="course-overdue"
                    className="flex flex-col gap-4 rounded-[var(--radius-slip)] bg-salmon px-3 pb-4 pt-3 sm:px-4"
                  >
                    <h3 id="course-overdue" className="flex items-baseline gap-2">
                      <span className="font-display text-[22px] text-danger">Lejárt</span>
                      <span className="text-[13px] font-semibold tabular-nums text-danger">{overdue.length}</span>
                    </h3>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-3">
                      {overdue.map((d, i) => (
                        <DeadlineChip key={d.id} deadline={d} now={now} showCourse={false} showDate index={i} />
                      ))}
                    </div>
                  </section>
                )}
                {weeks.map((week, wi) => (
                  <section
                    key={week.weekStart.toISOString()}
                    aria-label={week.label}
                    className="flex flex-col gap-3"
                    style={{ "--seq": wi + 1 } as CSSProperties}
                  >
                    <h3 className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-display text-[22px] text-heading">
                        {week.label.charAt(0).toUpperCase() + week.label.slice(1)}
                      </span>
                      {!/\d/.test(week.label) && (
                        <span className="text-[13.5px] text-muted">{weekRangeLabel(week.weekStart)}</span>
                      )}
                    </h3>
                    <DayAgenda weekStart={week.weekStart} deadlines={week.items} now={now} showCourse={false} />
                  </section>
                ))}
              </div>
            )}
            {done.length > 0 && (
              <details className="group rounded-[var(--radius-slip)] bg-strip px-3 py-2.5">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[14px] font-semibold text-heading [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="h-4 w-4 text-muted transition-transform duration-150 group-open:rotate-90" />
                  Kész ({done.length})
                </summary>
                <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-4 pb-2">
                  {done.map((d) => (
                    <DeadlineChip key={d.id} deadline={d} now={now} showCourse={false} showDate />
                  ))}
                </div>
              </details>
            )}
          </Section>

          {courseSessions.length > 0 && (
            <Section id="course-classes" title="Órák">
              <UpcomingClasses sessions={courseSessions} now={now} />
            </Section>
          )}

          <Section id="course-resources" title="Anyagok">
            <ResourceList courseId={course.id} />
          </Section>
        </div>
      </div>

      <CourseDialog open={editOpen} onClose={() => setEditOpen(false)} course={course} />
      <Dialog open={linksOpen} onClose={() => setLinksOpen(false)} title={`Linkek – ${course.name}`}>
        <LinkEditor courseId={course.id} />
      </Dialog>
      <DeadlineDialog open={deadlineOpen} onClose={() => setDeadlineOpen(false)} defaultCourseId={course.id} />
    </div>
  );
}
