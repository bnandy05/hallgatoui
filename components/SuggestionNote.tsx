"use client";

import { useT } from "@/lib/i18n/I18nProvider";
import type { CourseSuggestion } from "@/lib/suggest/client";

/** One muted line under a course choice that came from a guess the student should glance at. */
export function SuggestionNote({ suggestion }: { suggestion: CourseSuggestion | undefined }) {
  const t = useT().suggestionNote;
  if (!suggestion || suggestion.via === "exact" || suggestion.via === "keyword") return null;
  if (suggestion.via === "jev" && suggestion.courseId === null) return null; // "new course" is the default anyway
  return (
    <p className="mt-1.5 text-fine text-muted">
      {suggestion.via === "jev" ? t.jev(Math.round((suggestion.confidence ?? 0) * 100)) : t.similar}
    </p>
  );
}
