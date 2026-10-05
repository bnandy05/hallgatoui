"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  awaitingResults,
  linkedInstances,
  pendingInputs,
  upcomingAssessments,
  type AwaitingItem,
  type CatchUpGroup,
  type LinkedInstance,
  type UpcomingAssessment,
} from "@/lib/catchup";

const TICK_MS = 60 * 1000;

/** The current time, refreshed every minute, so a class that just ended shows up. */
export function useMinuteNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

export interface CatchUpData {
  linked: LinkedInstance[];
  pending: CatchUpGroup[];
  awaiting: AwaitingItem[];
  assessments: UpcomingAssessment[];
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
      now,
    };
  }, [courses, rules, results, sessions, deadlines, semester, now]);
}
