import type { AppStore, StoreSet, SubjectDecision } from "@/lib/store";
import type { Course, TimetableSource } from "@/lib/types";
import { newId } from "@/lib/id";
import { pickCourseColor } from "@/lib/colors";
import { applyMappingDecisions, applySubjectMapping, mappingSubjectKey, mergeTimetableImport, timetableCutoff } from "@/lib/ical/neptun";
import { budapestInstant } from "@/lib/ical/budapest";
import { rematchDeadlines } from "@/lib/ical/sync";
import { parseYmd } from "@/lib/timetable/semester";

/**
 * Turns the dialog's decisions into courses and a subject -> course mapping: creates the new
 * courses and adds the subject name to the keywords of the courses it is mapped onto.
 */
function resolveDecisions(
  courses: Course[],
  decisions: Record<string, SubjectDecision>,
  subjectNames: Record<string, string>
): { courses: Course[]; mapping: Record<string, string | null> } {
  const mapping: Record<string, string | null> = {};
  let next = courses;
  let created = 0;
  for (const [key, decision] of Object.entries(decisions)) {
    const subject = subjectNames[key] ?? subjectNames[mappingSubjectKey(key)] ?? key;
    if (decision.kind === "skip") {
      mapping[key] = null;
    } else if (decision.kind === "existing") {
      mapping[key] = decision.courseId;
      next = next.map((c) => {
        if (c.id !== decision.courseId) return c;
        const known = c.matchKeywords.some((k) => k.trim().toLowerCase() === subject.toLowerCase());
        return known ? c : { ...c, matchKeywords: [...c.matchKeywords, subject] };
      });
    } else {
      const id = newId();
      mapping[key] = id;
      next = [
        ...next,
        {
          id,
          name: decision.name.trim() || subject,
          color: pickCourseColor(courses.length + created),
          links: [],
          resources: [],
          matchKeywords: [subject],
          createdAt: new Date().toISOString(),
        },
      ];
      created += 1;
    }
  }
  return { courses: next, mapping };
}

export function timetableActions(set: StoreSet): Pick<AppStore, "importTimetable" | "remapTimetable" | "removeTimetableSource"> {
  return {
    importTimetable: (meta, parsed, decisions) => {
      const sourceId = meta.sourceId ?? newId();
      set((state) => {
        const subjectNames = Object.fromEntries(parsed.map((p) => [p.subjectKey, p.subject]));
        const { courses, mapping } = resolveDecisions(state.courses, decisions, subjectNames);
        const previous = state.timetableSources.find((s) => s.id === sourceId);
        const source: TimetableSource = {
          id: sourceId,
          // A re-import keeps the stored name; only a new source gets the caller's (locale-default) one.
          name: previous?.name ?? meta.name,
          url: meta.url ?? previous?.url,
          importedAt: new Date().toISOString(),
          // A re-import reuses the earlier mapping; only new subjects were asked about.
          subjectCourses: applyMappingDecisions(previous?.subjectCourses ?? {}, mapping),
        };
        // The import floor already folds in a same-term stored start; a stale one must not keep old terms.
        const semesterYmd = state.semester ? parseYmd(state.semester.start) : null;
        // A floor of this week's Monday means no term was identified: keep the old fallback then.
        const fromMs = meta.from ? Date.parse(meta.from) : NaN;
        const semesterStart = Number.isFinite(fromMs) && fromMs < timetableCutoff(new Date()).getTime()
          ? new Date(fromMs)
          : semesterYmd
            ? budapestInstant(semesterYmd, 0, 0)
            : undefined;
        return {
          courses,
          // Canvas deadlines imported earlier may match the new courses' keywords now.
          deadlines: rematchDeadlines(state.deadlines, state.feeds, courses),
          timetableSources: previous
            ? state.timetableSources.map((s) => (s.id === sourceId ? source : s))
            : [...state.timetableSources, source],
          classSessions: mergeTimetableImport(source, parsed, state.classSessions, {
            now: new Date(),
            ...(semesterStart && { semesterStart }),
          }),
        };
      });
      return sourceId;
    },
    remapTimetable: (sourceId, decisions) => {
      set((state) => {
        const previous = state.timetableSources.find((s) => s.id === sourceId);
        if (!previous) return state;
        const subjectNames: Record<string, string> = {};
        for (const s of state.classSessions) {
          if (s.sourceId === sourceId) subjectNames[s.subjectKey] = s.subject;
        }
        const { courses, mapping } = resolveDecisions(state.courses, decisions, subjectNames);
        const source = { ...previous, subjectCourses: applyMappingDecisions(previous.subjectCourses, mapping) };
        return {
          courses,
          deadlines: rematchDeadlines(state.deadlines, state.feeds, courses),
          timetableSources: state.timetableSources.map((s) => (s.id === sourceId ? source : s)),
          classSessions: applySubjectMapping(source, state.classSessions),
        };
      });
    },
    removeTimetableSource: (sourceId) => {
      set((state) => ({
        timetableSources: state.timetableSources.filter((s) => s.id !== sourceId),
        classSessions: state.classSessions.filter((s) => s.sourceId !== sourceId),
      }));
    },
  };
}
