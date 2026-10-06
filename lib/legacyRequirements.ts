// The dropped requirements tracker (Követelmények) left data in some documents: top-level
// `requirementRules`, `requirementResults`, `semester`, `catchUp`, a course's `requirements` text
// and resources of kind "kovetelmeny". Nothing reads them any more; this strips them wherever data
// enters the app (import, save, the server's response, the local cache). Pure.

import type { AppData, Course } from "@/lib/types";

const LEGACY_KEYS = ["requirementRules", "requirementResults", "semester", "catchUp"] as const;

/** A course without the requirements text and requirement documents (same object if it has none). */
export function withoutRequirements(course: Course): Course {
  const c = course as Course & { requirements?: unknown };
  const resources = Array.isArray(c.resources) ? c.resources : [];
  const hasDocs = resources.some((r) => (r?.kind as string) === "kovetelmeny");
  if (!("requirements" in c) && !hasDocs) return course;
  const { requirements: _text, ...rest } = c;
  void _text;
  return { ...rest, resources: hasDocs ? resources.filter((r) => (r?.kind as string) !== "kovetelmeny") : resources };
}

export function coursesWithoutRequirements(courses: Course[]): Course[] {
  return courses.map(withoutRequirements);
}

/** AppData without any of the tracker's leftovers. */
export function withoutRequirementData<T extends AppData>(data: T): T {
  const copy = { ...data } as T & Record<string, unknown>;
  for (const key of LEGACY_KEYS) delete copy[key];
  return { ...copy, courses: coursesWithoutRequirements(data.courses ?? []) };
}
