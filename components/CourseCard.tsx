"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Link2, MoreVertical } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Course } from "@/lib/types";
import { formatRelative, nextDeadlineFor, urgencyOf, type Urgency } from "@/lib/radar";
import { CourseDialog } from "@/components/CourseDialog";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/LinkButton";
import { LinkEditor } from "@/components/LinkEditor";

const URGENCY_TEXT_CLASS: Record<Urgency, string> = {
  overdue: "text-danger",
  critical: "text-danger",
  soon: "text-warning",
  later: "text-muted",
  done: "text-muted",
};

const MAX_VISIBLE_LINKS = 6;

export interface CourseCardProps {
  course: Course;
}

export function CourseCard({ course }: CourseCardProps) {
  const deleteCourse = useStore((s) => s.deleteCourse);
  const deadlines = useStore((s) => s.deadlines);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handleMouseDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  function handleDelete() {
    setMenuOpen(false);
    if (confirm("Biztosan törlöd?")) {
      deleteCourse(course.id);
    }
  }

  const meta = [course.code, course.semester].filter(Boolean).join(" · ");
  const now = new Date();
  const nextDeadline = nextDeadlineFor(course.id, deadlines, now);

  return (
    <Card
      interactive
      className="relative flex flex-col gap-2 !p-4 !pl-5 hover:z-10 focus-within:z-10"
      style={{ borderLeftColor: course.color, borderLeftWidth: "4px" }}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/targy/${course.id}`}
          className="min-w-0 max-w-full truncate text-base font-bold text-heading hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {course.name}
        </Link>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-label="Műveletek"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-md p-1 text-muted hover:bg-inset focus-visible:outline-2 focus-visible:outline-accent"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-md border border-border bg-card py-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setEditOpen(true);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-inset"
              >
                Szerkesztés
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="block w-full px-3 py-1.5 text-left text-sm text-danger hover:bg-inset"
              >
                Törlés
              </button>
            </div>
          )}
        </div>
      </div>

      {meta && <p className="text-sm text-muted">{meta}</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        {course.links.slice(0, MAX_VISIBLE_LINKS).map((link) => (
          <LinkButton key={link.id} link={link} />
        ))}
        {course.links.length > MAX_VISIBLE_LINKS && (
          <Link
            href={`/targy/${course.id}`}
            className="inline-flex items-center rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-muted hover:bg-inset focus-visible:outline-2 focus-visible:outline-accent"
          >
            +{course.links.length - MAX_VISIBLE_LINKS}
          </Link>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setLinksOpen(true)}
        >
          <Link2 className="h-4 w-4" />
          {course.links.length > 0 ? "Linkek" : "Linkek hozzáadása"}
        </Button>
      </div>

      {nextDeadline ? (
        <p
          className={`truncate text-sm ${URGENCY_TEXT_CLASS[urgencyOf(nextDeadline, now)]}`}
        >
          Következő: {nextDeadline.title} · {formatRelative(new Date(nextDeadline.due), now)}
        </p>
      ) : (
        <p className="text-sm text-muted">Nincs közelgő határidő.</p>
      )}

      <CourseDialog open={editOpen} onClose={() => setEditOpen(false)} course={course} />
      <Dialog
        open={linksOpen}
        onClose={() => setLinksOpen(false)}
        title={`Linkek – ${course.name}`}
      >
        <LinkEditor courseId={course.id} />
      </Dialog>
    </Card>
  );
}
