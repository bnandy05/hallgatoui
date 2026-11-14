import type { AppData, SemesterData } from "@/lib/types";

export const MAX_SEMESTER_NAME = 80;

export function emptySemester(): SemesterData {
  return {
    courses: [], deadlines: [], feeds: [], ignoredDuplicatePairs: [],
    classSessions: [], timetableSources: [], requirementRules: [], requirementResults: [],
  };
}

export function selectSemester(data: SemesterData): SemesterData {
  const { courses, deadlines, feeds, ignoredDuplicatePairs = [], classSessions = [], timetableSources = [],
    requirementRules = [], requirementResults = [], semester, catchUp } = data;
  return {
    courses, deadlines, feeds, ignoredDuplicatePairs, classSessions, timetableSources,
    requirementRules, requirementResults, ...(semester && { semester }), ...(catchUp && { catchUp }),
  };
}

export function hasSemesterContent(data: SemesterData): boolean {
  return data.courses.length > 0 || data.deadlines.length > 0 || data.feeds.length > 0 ||
    data.timetableSources.length > 0 || data.classSessions.length > 0 ||
    data.requirementRules.length > 0 || data.requirementResults.length > 0;
}

export function archiveSemester(data: AppData, name: string, archivedAt: string): Partial<AppData> | null {
  const label = name.trim();
  if (!label || label.length > MAX_SEMESTER_NAME || !hasSemesterContent(data)) return null;
  const number = data.semesterNumber ?? 0;
  if (number >= Number.MAX_SAFE_INTEGER) return null;
  return {
    ...emptySemester(),
    semester: undefined,
    catchUp: undefined,
    semesterNumber: number + 1,
    semesterArchives: [...(data.semesterArchives ?? []), { number, name: label, archivedAt, data: selectSemester(data) }],
  };
}
