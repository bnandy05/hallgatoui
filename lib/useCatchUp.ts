"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useMinuteNow } from "@/lib/useMinuteNow";
import {
  awaitingResults,
  linkedInstances,
  pendingInputs,
  upcomingAssessments,
  type AwaitingItem,
  type CatchUpGroup,
  type CatchUpInput,
  type LinkedInstance,
  type UpcomingAssessment,
} from "@/lib/catchup";

export interface CatchUpData {
  linked: LinkedInstance[];
  pending: CatchUpGroup[];
  awaiting: AwaitingItem[];
  assessments: UpcomingAssessment[];
  /** The input the lists were derived from, so the bell can compute grade alerts from the same data. */
  input: CatchUpInput;
  now: Date;
}

/** Everything the catch-up popup and the reminders need, derived from the store. */
export function useCatchUpData(): CatchUpData {
  const courses = useStore((s) => s.courses);
  const rules = useStore((s) => s.requirementRules);
  const results = useStore((s) => s.requirementResults);
  const sessions = useStore((s) => s.classSessions);
  const deadlines = useStore((s) => s.deadlines);
  const semester = useStore((s) => s.semester);
  const now = useMinuteNow();

  return useMemo(() => {
    const input = { courses, rules, results, sessions, deadlines, semester, now };
    const linked = linkedInstances(input);
    return {
      linked,
      pending: pendingInputs(input, linked),
      awaiting: awaitingResults(input),
      assessments: upcomingAssessments(input, linked),
      input,
      now,
    };
  }, [courses, rules, results, sessions, deadlines, semester, now]);
}
