"use client";

import { useEffect, useMemo, useState } from "react";
import type { Course } from "@/lib/types";
import { askCourses, localCourseSuggestions, type CourseSuggestion } from "@/lib/suggest/client";

/**
 * Course suggestions for the names in a mapping dialog: the local ones at once, Jev's for the
 * rest when its answer arrives (`asking` meanwhile). Asked once per dialog opening.
 */
export function useCourseSuggestions(names: string[], courses: Course[]) {
  const key = names.join("\n");
  // Fixed for the dialog's lifetime: courses created while it is open don't re-ask.
  const [initialCourses] = useState(courses);
  const local = useMemo(() => localCourseSuggestions(key ? key.split("\n") : [], initialCourses), [key, initialCourses]);
  const [jev, setJev] = useState<Map<string, CourseSuggestion> | null>(null);

  useEffect(() => {
    if (local.ask.length === 0) return;
    let cancelled = false;
    void askCourses(local.ask, initialCourses).then((answers) => {
      if (!cancelled) setJev(answers);
    });
    return () => {
      cancelled = true;
    };
  }, [local, initialCourses]);

  const suggestions = useMemo(() => new Map([...local.found, ...(jev ?? [])]), [local, jev]);
  return { suggestions, asking: local.ask.length > 0 && jev === null };
}
