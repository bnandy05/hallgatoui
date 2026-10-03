"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { applyDedupe, type DedupeResult } from "@/lib/ical/dedupe";
import type { Course, Deadline, IcalFeed } from "@/lib/types";

// Every chip asks for its own extras, so the last computation is shared by input identity.
let last: {
  args: [Deadline[], IcalFeed[], string[], boolean, Course[]];
  result: DedupeResult;
} | null = null;

function compute(
  deadlines: Deadline[],
  feeds: IcalFeed[],
  ignored: string[],
  enabled: boolean,
  courses: Course[]
): DedupeResult {
  const args: [Deadline[], IcalFeed[], string[], boolean, Course[]] = [
    deadlines,
    feeds,
    ignored,
    enabled,
    courses,
  ];
  if (last && last.args.every((a, i) => a === args[i])) return last.result;
  const result = applyDedupe(deadlines, feeds, ignored, enabled, courses);
  last = { args, result };
  return result;
}

function useDedupeResult(): DedupeResult {
  const deadlines = useStore((s) => s.deadlines);
  const feeds = useStore((s) => s.feeds);
  const ignored = useStore((s) => s.ignoredDuplicatePairs);
  const enabled = useStore((s) => s.exportOptions.dedupe);
  const courses = useStore((s) => s.courses);
  return useMemo(
    () => compute(deadlines, feeds, ignored, enabled, courses),
    [deadlines, feeds, ignored, enabled, courses]
  );
}

/** The deadlines to list and count (duplicates merged into their primary) plus the hidden copies. */
export function useDedupedDeadlines(): DedupeResult {
  return useDedupeResult();
}

/** The other copies of a primary deadline (empty for everything else). */
export function useDuplicateCopies(deadlineId: string): Deadline[] {
  const { extras } = useDedupeResult();
  return extras.get(deadlineId) ?? [];
}
