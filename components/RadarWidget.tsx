"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { weekSummary } from "@/lib/radar";
import { Button } from "@/components/ui/Button";
import { DeadlineDialog } from "@/components/DeadlineDialog";
import { DeadlineItem } from "@/components/DeadlineItem";

const MAX_VISIBLE = 5;

export function RadarWidget() {
  const deadlines = useStore((s) => s.deadlines);
  const [addOpen, setAddOpen] = useState(false);
  const [now] = useState(() => new Date());

  const summary = useMemo(() => weekSummary(deadlines, now), [deadlines, now]);
  const upcoming = useMemo(
    () =>
      [...deadlines]
        .filter((d) => !d.done)
        .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
        .slice(0, MAX_VISIBLE),
    [deadlines]
  );

  if (deadlines.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted">Nincs rögzített határidő.</p>
        <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Határidő
        </Button>
        <DeadlineDialog open={addOpen} onClose={() => setAddOpen(false)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-foreground">
          Ezen a héten <strong>{summary.total}</strong> dolog jár le, ebből{" "}
          <strong>{summary.critical}</strong> kritikus.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Határidő
          </Button>
          <Link
            href="/radar"
            className="text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Teljes radar →
          </Link>
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {upcoming.map((d) => (
            <DeadlineItem key={d.id} deadline={d} compact />
          ))}
        </div>
      )}

      <DeadlineDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
