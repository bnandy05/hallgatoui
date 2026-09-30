"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileQuestion, Pencil, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { CourseDialog } from "@/components/CourseDialog";
import { LinkButton } from "@/components/LinkButton";
import { LinkEditor } from "@/components/LinkEditor";
import { ResourceList } from "@/components/ResourceList";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export interface CourseDetailProps {
  id: string;
}

function BackLink() {
  return (
    <Link
      href="/"
      className="w-fit text-sm text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
    >
      ← Tárgyaim
    </Link>
  );
}

function CourseDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-4 w-20 animate-pulse rounded-md bg-border/40" />
      <div className="h-24 animate-pulse rounded-lg border border-border bg-border/40" />
      <div className="h-32 animate-pulse rounded-lg border border-border bg-border/40" />
      <div className="h-32 animate-pulse rounded-lg border border-border bg-border/40" />
    </div>
  );
}

export function CourseDetail({ id }: CourseDetailProps) {
  const hydrated = useHydrated();
  const course = useStore((s) => s.courses.find((c) => c.id === id));
  const deleteCourse = useStore((s) => s.deleteCourse);
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [linksEditing, setLinksEditing] = useState(false);
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    if (hydrated && course && course.links.length === 0 && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setLinksEditing(true);
    }
  }, [hydrated, course]);

  if (!hydrated) {
    return <CourseDetailSkeleton />;
  }

  if (!course) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <EmptyState
          icon={FileQuestion}
          title="A tárgy nem található"
          text="Lehet, hogy törölve lett, vagy hibás a link."
          action={
            <Link href="/">
              <Button type="button" variant="secondary">
                Vissza a tárgyaimhoz
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  function handleDelete() {
    if (!course) return;
    if (confirm("Biztosan törlöd?")) {
      router.push("/");
      deleteCourse(course.id);
    }
  }

  const meta = [course.code, course.semester].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      <div
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 pl-6 sm:flex-row sm:items-start sm:justify-between"
        style={{ borderLeftColor: course.color, borderLeftWidth: "4px" }}
      >
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{course.name}</h1>
          {meta && <p className="mt-1 text-sm text-muted">{meta}</p>}
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
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">Gyorslinkek</h2>
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
        <h2 className="text-lg font-semibold text-foreground">Határidők</h2>
        {/* Phase 4: course deadlines */}
        <p className="text-sm text-muted">Hamarosan.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">Tudásbázis</h2>
        <ResourceList courseId={course.id} />
      </section>

      <CourseDialog open={editOpen} onClose={() => setEditOpen(false)} course={course} />
    </div>
  );
}
