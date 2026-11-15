import { normalizeCourseName } from "@/lib/ical/canvas";
import { normalizeSemester, normalizeSubjectCode } from "@/lib/rules/shared";
import type { Course, IcalFeed } from "@/lib/types";

/** Canvas can append the section number to the subject code. */
export function requirementCourseCode(raw: string | undefined): string | null {
  if (!raw || /[,;]/.test(raw)) return null;
  const section = /^([\w./-]*[0-9][\w./-]*)[ \t]+\d{1,4}$/.exec(raw.trim());
  return normalizeSubjectCode(section?.[1] ?? raw);
}

/** Labelled code fields in requirement documents, including PDF text split across two lines. */
export function documentCourseCode(text: string): string | null {
  const label = /(?:\b(?:tantárgy|tárgy|kurzus)[ \t]*(?:kódja|kód)|\b(?:course|subject|module)[ \t]+code)\b[ \t]*(?:[:：=–—-][ \t]*|[ \t]+|\r?\n)[ \t]*(?:\r?\n[ \t]*)?([\p{L}\d][\p{L}\d_.\/-]{2,29})(?![\p{L}\d_.\/-])([^\r\n]*)/giu;
  const found = new Set<string>();
  for (const match of text.normalize("NFC").matchAll(label)) {
    const raw = match[1];
    if (!/[a-z]/i.test(raw) || !/\d/.test(raw)) continue;
    if (/^\s*(?:[,;/&]|és\b|and\b)\s*[a-z\d_.\/-]*\d/i.test(match[2])) return null;
    const code = requirementCourseCode(raw.replace(/[.]$/, ""));
    if (code) found.add(code);
  }
  return found.size === 1 ? [...found][0] : null;
}

/** Use linked Canvas metadata only when it points to one subject code. */
export function linkedCourseCode(course: Course, feeds: IcalFeed[]): string | null {
  const urls = new Set(course.links.map((link) => link.url));
  const keywords = new Set(course.matchKeywords.map(normalizeCourseName));
  const codes = new Set<string>();
  const now = new Date();
  const semester = course.semester && normalizeSemester(course.semester, now);
  for (const feed of feeds) {
    if (feed.platformId !== "canvas" || (feed.courseId && feed.courseId !== course.id)) continue;
    for (const context of feed.discovered ?? []) {
      if (feed.ignoredContexts?.includes(context.key)) continue;
      if (semester && context.semester && semester !== normalizeSemester(context.semester, now)) continue;
      const known = (context.courseUrl && urls.has(context.courseUrl)) ||
        (context.code && keywords.has(normalizeCourseName(context.code))) ||
        keywords.has(normalizeCourseName(context.label)) ||
        (feed.courseId === course.id && feed.discovered?.length === 1);
      if (!known) continue;
      const code = requirementCourseCode(context.code);
      if (code) codes.add(code);
    }
  }
  return codes.size === 1 ? [...codes][0] : null;
}
