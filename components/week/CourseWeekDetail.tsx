"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FileQuestion, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { formatRelative, isCritical, nextDeadlineFor, weekRangeLabel, weekStartOf } from "@/lib/radar";
import { NEW_LAYOUT_BASE } from "@/lib/routes";
import { CourseDialog } from "@/components/CourseDialog";
import { DeadlineDialog } from "@/components/DeadlineDialog";
import { DeadlineItem } from "@/components/DeadlineItem";
import { LinkButton } from "@/components/LinkButton";
import { LinkEditor } from "@/components/LinkEditor";
import { ResourceList } from "@/components/ResourceList";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { TabPanel, Tabs } from "@/components/ui/Tabs";
import { WeekBoard } from "@/components/week/WeekBoard";
import { WeekNav } from "@/components/week/WeekNav";

type TabKey = "hataridok" | "tudasbazis" | "linkek";

function BackLink() {
  return (
    <Link href={NEW_LAYOUT_BASE} className="w-fit text-sm text-muted hover:text-foreground">
      ← Heti menetrend
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-4 w-28 animate-pulse rounded-md bg-border/40" />
      <div className="h-36 animate-pulse rounded-[var(--radius)] border border-border bg-border/40" />
      <div className="h-56 animate-pulse rounded-[var(--radius)] border border-border bg-border/40" />
    </div>
  );
}

export function CourseWeekDetail({ id }: { id: string }) {
  const hydrated = useHydrated();
  const course = useStore((s) => s.courses.find((c) => c.id === id));
  const deleteCourse = useStore((s) => s.deleteCourse);
  const deadlines = useStore((s) => s.deadlines);
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
          text="Lehet, hogy törölve lett, vagy hibás a link."
          action={
            <Link href={NEW_LAYOUT_BASE} className={buttonClasses({ variant: "secondary" })}>
              Vissza a menetrendhez
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
  const criticalCount = upcoming.filter((d) => isCritical(d, now)).length;
  const isCurrent = weekStart.getTime() === currentWeekStart.getTime();

  function handleDelete() {
    if (!course) return;
    if (confirm("Biztosan törlöd?")) {
      setDeleting(true);
      router.push(NEW_LAYOUT_BASE);
      deleteCourse(course.id);
    }
  }

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <BackLink />

      <header
        className="flex flex-col gap-5 rounded-[var(--radius)] border border-border bg-card p-[22px]"
        style={{ boxShadow: `inset 0 3px 0 ${course.color}` }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Eyebrow>{meta || "Tárgy"}</Eyebrow>
            <h1 className="mt-2 break-words text-[clamp(26px,4vw,36px)] font-bold leading-[1.12] tracking-[-0.01em] text-heading">
              {course.name}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {upcoming.length} nyitott
              {criticalCount > 0 && (
                <>
                  {" · "}
                  <span className="text-danger">{criticalCount} kritikus</span>
                </>
              )}
              {next && (
                <>
                  {" · következő "}
                  <span className="text-foreground">{formatRelative(new Date(next.due), now)}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Szerkesztés
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="text-danger hover:!bg-danger/10"
            >
              <Trash2 className="h-4 w-4" />
              Törlés
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
          {course.links.map((link) => (
            <LinkButton key={link.id} link={link} size="md" />
          ))}
          {course.links.length === 0 && (
            <p className="text-sm text-muted">Még nincs linked ehhez a tárgyhoz.</p>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setTab("linkek")}>
            <Settings2 className="h-4 w-4" />
            Linkek kezelése
          </Button>
        </div>
      </header>

      <section className="flex flex-col gap-4" aria-labelledby="course-week-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="course-week-heading" className="text-lg font-bold text-heading">
            {isCurrent ? "Ez a hét" : "Hét"}{" "}
            <span className="text-sm font-normal text-muted">{weekRangeLabel(weekStart)}</span>
          </h2>
          <WeekNav weekStart={weekStart} currentWeekStart={currentWeekStart} onChange={setWeekStart} />
        </div>
        <WeekBoard
          weekStart={weekStart}
          deadlines={courseDeadlines}
          now={now}
          gutter={isCurrent}
          showCourse={false}
          dense
          emptyDay="Ezen a héten nincs nyitott határidő."
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
            { id: "tudasbazis", label: "Tudásbázis", count: resourceCount },
          ]}
        />

        <TabPanel id="hataridok" active={activeTab === "hataridok"} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted">Minden határidő időrendben, nem csak ez a hét.</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => setDeadlineOpen(true)}>
              <Plus className="h-4 w-4" />
              Határidő
            </Button>
          </div>
          {upcoming.length === 0 && done.length === 0 ? (
            <p className="text-sm text-muted">Még nincs határidő ehhez a tárgyhoz.</p>
          ) : (
            <>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted">Nincs közelgő határidő.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {upcoming.map((d) => (
                    <DeadlineItem key={d.id} deadline={d} />
                  ))}
                </div>
              )}
              {done.length > 0 && (
                <details className="group rounded-md border border-border bg-card px-3 py-2">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="h-4 w-4 text-muted transition-transform duration-150 group-open:rotate-90" />
                    Kész ({done.length})
                  </summary>
                  <div className="mt-2 flex flex-col gap-2">
                    {done.map((d) => (
                      <DeadlineItem key={d.id} deadline={d} />
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
