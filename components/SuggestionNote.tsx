import type { CourseSuggestion } from "@/lib/suggest/client";

/** One muted line under a course choice that came from a guess the student should glance at. */
export function SuggestionNote({ suggestion }: { suggestion: CourseSuggestion | undefined }) {
  if (!suggestion || suggestion.via === "exact" || suggestion.via === "keyword") return null;
  if (suggestion.via === "jev" && suggestion.courseId === null) return null; // "new course" is the default anyway
  return (
    <p className="mt-1.5 text-[12.5px] text-muted">
      {suggestion.via === "jev"
        ? `A Jev javaslata (${Math.round((suggestion.confidence ?? 0) * 100)}% biztos), ellenőrizd.`
        : "Hasonló nevű tárgy, ellenőrizd."}
    </p>
  );
}
