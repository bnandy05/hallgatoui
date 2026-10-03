"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileQuestion, Pencil, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { CourseDialog } from "@/components/CourseDialog";
import { DeadlineDialog } from "@/components/DeadlineDialog";
import { DeadlineItem } from "@/components/DeadlineItem";
import { LinkButton } from "@/components/LinkButton";
import { LinkEditor } from "@/components/LinkEditor";
import { ResourceList } from "@/components/ResourceList";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow } from "@/components/ui/Eyebrow";

export interface CourseDetailProps {
  id: string;
}

function BackLink() {
  return (
    <Link
      href="/"
      className="w-fit text-sm text-muted hover:text-foreground"
    >
      ← Tárgyaim
    </Link>
  );
}

function CourseDetailSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="h-4 w-20 animate-pulse rounded-md bg-border/40" />
      <div className="h-24 animate-pulse rounded-[var(--radius)] border border-border bg-border/40" />
      <div className="h-32 animate-pulse rounded-[var(--radius)] border border-border bg-border/40" />
      <div className="h-32 animate-pulse rounded-[var(--radius)] border border-border bg-border/40" />
    </div>
  );
}

export function CourseDetail({ id }: CourseDetailProps) {
  const hydrated = useHydrated();
  const course = useStore((s) => s.courses.find((c) => c.id === id));
  const deleteCourse = useStore((s) => s.deleteCourse);
  const deadlines = useStore((s) => s.deadlines);
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [linksEditing, setLinksEditing] = useState(false);
  const [deadlineDialogOpen, setDeadlineDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    if (hydrated && course && course.links.length === 0 && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setLinksEditing(true);
    }
  }, [hydrated, course]);

  const courseDeadlines = useMemo(
    () => deadlines.filter((d) => d.courseId === id),
    [deadlines, id]
  );
  const upcomingDeadlines = useMemo(
    () =>
      courseDeadlines
        .filter((d) => !d.done)
        .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime()),
    [courseDeadlines]
  );
  const doneDeadlines = useMemo(
    () => courseDeadlines.filter((d) => d.done),
    [courseDeadlines]
  );

  if (!hydrated || deleting) {
    return <CourseDetailSkeleton />;
  }

  if (!course) {
    return (
      <div className="flex flex-col gap-8">
        <BackLink />
        <EmptyState
          icon={FileQuestion}
          title="A tárgy nem található"
          text="Lehet, hogy törölve lett, vagy hibás a link."
          action={
            <Link href="/" className={buttonClasses({ variant: "secondary" })}>
              Vissza a tárgyaimhoz
            </Link>
          }
        />
      </div>
    );
  }

  function handleDelete() {
    if (!course) return;
    if (confirm("Biztosan törlöd?")) {
      setDeleting(true);
      router.push("/");
      deleteCourse(course.id);
    }
  }

  const meta = [course.code, course.semester].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-8">
      <BackLink />

      <Card
        className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        style={{ borderLeftColor: course.color, borderLeftWidth: "4px" }}
      >
        <div className="min-w-0">
          <Eyebrow>{meta || "Tárgy"}</Eyebrow>
          <h1 className="mt-2 break-words text-[clamp(26px,4vw,36px)] font-bold leading-[1.12] tracking-[-0.01em] text-heading">
            {course.name}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Szerkesztés
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
            Törlés
          </Button>
        </div>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-heading">Gyorslinkek</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setLinksEditing((v) => !v)}
          >
            {linksEditing ? "Kész" : "Szerkesztés"}
          </Button>
        </div>

        {course.links.length === 0 && (
          <p className="text-sm text-muted">Még nincs linked ehhez a tárgyhoz.</p>
        )}

        {linksEditing ? (
          <LinkEditor courseId={course.id} />
        ) : (
          course.links.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {course.links.map((link) => (
                <LinkButton key={link.id} link={link} size="md" />
              ))}
            </div>
          )
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-heading">Határidők</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDeadlineDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Határidő
          </Button>
        </div>

        {upcomingDeadlines.length === 0 && doneDeadlines.length === 0 ? (
          <p className="text-sm text-muted">Még nincs határidő ehhez a tárgyhoz.</p>
        ) : (
          <>
            {upcomingDeadlines.length === 0 ? (
              <p className="text-sm text-muted">Nincs közelgő határidő.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {upcomingDeadlines.map((d) => (
                  <DeadlineItem key={d.id} deadline={d} />
                ))}
              </div>
            )}

            {doneDeadlines.length > 0 && (
              <details className="rounded-md border border-border bg-card px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  Kész ({doneDeadlines.length})
                </summary>
                <div className="mt-2 flex flex-col gap-2">
                  {doneDeadlines.map((d) => (
                    <DeadlineItem key={d.id} deadline={d} />
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-heading">Tudásbázis</h2>
        <ResourceList courseId={course.id} />
      </section>

      <CourseDialog open={editOpen} onClose={() => setEditOpen(false)} course={course} />
      <DeadlineDialog
        open={deadlineDialogOpen}
        onClose={() => setDeadlineDialogOpen(false)}
        defaultCourseId={course.id}
      />
    </div>
  );
}
