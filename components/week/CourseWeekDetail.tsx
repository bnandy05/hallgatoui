"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, FileQuestion, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { hu } from "date-fns/locale";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { useDedupedDeadlines } from "@/lib/useDedupedDeadlines";
import { nextSessionFor } from "@/lib/ical/neptun";
import { formatRelative, isCritical, nextDeadlineFor, weekRangeLabel, weekStartOf } from "@/lib/radar";
import { CourseDialog } from "@/components/CourseDialog";
import { DeadlineDialog } from "@/components/DeadlineDialog";
import { DeadlineChip } from "@/components/week/DeadlineChip";
import { LinkButton } from "@/components/LinkButton";
import { LinkEditor } from "@/components/LinkEditor";
import { ResourceList } from "@/components/ResourceList";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { TabPanel, Tabs } from "@/components/ui/Tabs";
import { WeekBoard } from "@/components/week/WeekBoard";
import { WeekNav } from "@/components/week/WeekNav";

type TabKey = "hataridok" | "tudasbazis" | "linkek";

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
      <div className="h-4 w-28 animate-pulse rounded-[var(--radius)] bg-white/40" />
      <div className="h-36 animate-pulse rounded-[var(--radius-slip)] bg-white/40" />
      <div className="h-56 animate-pulse rounded-[var(--radius-slip)] bg-white/40" />
    </div>
  );
}

export function CourseWeekDetail({ id }: { id: string }) {
  const hydrated = useHydrated();
  const course = useStore((s) => s.courses.find((c) => c.id === id));
  const deleteCourse = useStore((s) => s.deleteCourse);
  const { visible: deadlines } = useDedupedDeadlines();
  const classSessions = useStore((s) => s.classSessions);
  const resourceCount = useStore(
    (s) => s.courses.find((c) => c.id === id)?.resources.length ?? 0
  );
  const router = useRouter();

  const [now] = useState(() => new Date());
  const currentWeekStart = useMemo(() => weekStartOf(now), [now]);
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [tab, setTab] = useState<TabKey | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const courseDeadlines = useMemo(
    () => deadlines.filter((d) => d.courseId === id),
    [deadlines, id]
  );
  const courseSessions = useMemo(
    () => classSessions.filter((s) => s.courseId === id),
    [classSessions, id]
  );
  const upcoming = useMemo(
    () =>
      courseDeadlines
        .filter((d) => !d.done)
        .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime()),
    [courseDeadlines]
  );
  const done = useMemo(() => courseDeadlines.filter((d) => d.done), [courseDeadlines]);

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

  // A course without links opens on the link editor, like the original page did.
  const activeTab: TabKey = tab ?? (course.links.length === 0 ? "linkek" : "hataridok");
  const meta = [course.code, course.semester].filter(Boolean).join(" · ");
  const next = nextDeadlineFor(course.id, deadlines, now);
  const nextClass = nextSessionFor(course.id, courseSessions, now);
  const criticalCount = upcoming.filter((d) => isCritical(d, now)).length;
  const isCurrent = weekStart.getTime() === currentWeekStart.getTime();

  function handleDelete() {
    if (!course) return;
    if (confirm("Biztosan törlöd?")) {
      setDeleting(true);
      router.push("/");
      deleteCourse(course.id);
    }
  }

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <BackLink />

      <header className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-display flex items-start gap-3 break-words text-[clamp(34px,5.2vw,52px)] text-heading [text-wrap:balance]">
              <span aria-hidden="true" className="relative mt-[0.32em] h-[13px] w-[13px] shrink-0">
                <span className="pin left-0 top-0 !h-[13px] !w-[13px]" style={{ "--pin-color": course.color } as CSSProperties} />
              </span>
              {course.name}
            </h1>
            <p className="mt-2 text-[15px] text-muted">
              {meta && <span className="tabular-nums">{meta} · </span>}
              {upcoming.length === 0 ? "Nincs nyitott határidő" : `${upcoming.length} nyitott határidő`}
              {criticalCount > 0 && (
                <>
                  {", ebből "}
                  <span className="font-semibold text-danger">{criticalCount} kritikus</span>
                </>
              )}
              {next && (
                <>
                  {" · a következő "}
                  <span className="font-semibold text-heading">{formatRelative(new Date(next.due), now)}</span>
                </>
              )}
              {nextClass && (
                <>
                  {" · következő óra: "}
                  <span className="font-semibold text-heading">
                    {format(new Date(nextClass.start), "EEEE HH:mm", { locale: hu })}
                    {nextClass.room && `, ${nextClass.room}`}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setDeadlineOpen(true)}>
              <Plus className="h-4 w-4" />
              Határidő
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Szerkesztés
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              aria-label="Tárgy törlése"
              className="!px-2 text-danger hover:!bg-danger/10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {course.links.map((link) => (
            <LinkButton key={link.id} link={link} size="md" />
          ))}
          {course.links.length === 0 && (
            <p className="text-[14px] text-muted">Ehhez a tárgyhoz még nincs link.</p>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setTab("linkek")}>
            <Settings2 className="h-4 w-4" />
            Linkek kezelése
          </Button>
        </div>
      </header>

      <section className="flex flex-col gap-4" aria-labelledby="course-week-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="course-week-heading" className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-display text-[clamp(24px,3vw,30px)] text-heading">{isCurrent ? "Ez a hét" : "Hét"}</span>
            <span className="text-[14px] text-muted">{weekRangeLabel(weekStart)}</span>
          </h2>
          <WeekNav weekStart={weekStart} currentWeekStart={currentWeekStart} onChange={setWeekStart} />
        </div>
        <WeekBoard
          weekStart={weekStart}
          deadlines={courseDeadlines}
          sessions={courseSessions}
          now={now}
          gutter={isCurrent}
          showCourse={false}
          dense
          intro
          emptyDay="Ezen a héten nincs határidő."
          label={`${course.name}, ${weekRangeLabel(weekStart)}`}
        />
      </section>

      <section className="flex flex-col gap-5">
        <Tabs
          label="Tárgy részletei"
          value={activeTab}
          onChange={(key) => setTab(key as TabKey)}
          items={[
            { id: "hataridok", label: "Határidők", count: upcoming.length },
            { id: "linkek", label: "Linkek", count: course.links.length },
            { id: "tudasbazis", label: "Anyagok", count: resourceCount },
          ]}
        />

        <TabPanel id="hataridok" active={activeTab === "hataridok"} className="flex flex-col gap-3">
          {upcoming.length === 0 && done.length === 0 ? (
            <p className="text-[14px] text-muted">Ehhez a tárgyhoz még nincs határidő.</p>
          ) : (
            <>
              {upcoming.length === 0 ? (
                <p className="text-[14px] text-muted">Nincs nyitott határidő.</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4 pt-1">
                  {upcoming.map((d) => (
                    <DeadlineChip key={d.id} deadline={d} now={now} showCourse={false} showDate />
                  ))}
                </div>
              )}
              {done.length > 0 && (
                <details className="group rounded-[var(--radius-slip)] bg-strip px-3 py-2.5">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[14px] font-semibold text-heading [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="h-4 w-4 text-muted transition-transform duration-150 group-open:rotate-90" />
                    Kész ({done.length})
                  </summary>
                  <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4 pb-2">
                    {done.map((d) => (
                      <DeadlineChip key={d.id} deadline={d} now={now} showCourse={false} showDate />
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </TabPanel>

        <TabPanel id="tudasbazis" active={activeTab === "tudasbazis"}>
          <ResourceList courseId={course.id} />
        </TabPanel>

        <TabPanel id="linkek" active={activeTab === "linkek"}>
          <LinkEditor courseId={course.id} />
        </TabPanel>
      </section>

      <CourseDialog open={editOpen} onClose={() => setEditOpen(false)} course={course} />
      <DeadlineDialog
        open={deadlineOpen}
        onClose={() => setDeadlineOpen(false)}
        defaultCourseId={course.id}
      />
    </div>
  );
}
