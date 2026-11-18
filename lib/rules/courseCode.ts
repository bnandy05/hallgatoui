import { normalizeCourseName } from "@/lib/ical/canvas";
import { normalizeSemester, normalizeSubjectCode } from "@/lib/rules/shared";
import type { Course, CourseCode, IcalFeed } from "@/lib/types";

/** Canvas can append the section number to the subject code. */
export function requirementCourseCode(raw: string | undefined): string | null {
  if (!raw || /[,;]/.test(raw)) return null;
  const section = /^([\w./-]*[0-9][\w./-]*)[ \t]+\d{1,4}$/.exec(raw.trim());
  return normalizeSubjectCode(section?.[1] ?? raw);
}

/** Preserve each imported identity separately from its section/group and original label. */
export function parseCourseCodes(raw: string | undefined): CourseCode[] {
  if (!raw) return [];
  return raw.split(/[,;\n]+/).flatMap((value) => {
    const text = value.trim();
    const match = /^([\w./-]*[0-9][\w./-]*)[ \t]+(\d{1,4})$/.exec(text);
    const code = requirementCourseCode(text);
    return code ? [{ code, ...(match && { group: match[2] }), raw: text }] : [];
  });
}

export function courseCodes(course: Pick<Course, "code" | "codes">): string[] {
  return [...new Set((course.codes?.length ? course.codes : parseCourseCodes(course.code)).map((c) => requirementCourseCode(c.code)).filter((s): s is string => !!s))];
}

export function documentCourseCodes(text: string): string[] {
  const lines = text.normalize("NFC").split(/\r?\n/);
  const found = new Set<string>();
  for (let n = 0; n < lines.length; n++) {
    const label = /(?:\b(?:tantárgy|tárgy|kurzus)[ \t]*(?:kódja|kód)(?:ok|jai)?|\b(?:course|subject|module)[ \t]+codes?)\b[ \t]*[:：=–—-]?[ \t]*/iu.exec(lines[n]);
    if (!label) continue;
    const tail = lines[n].slice(label.index + label[0].length).trim() || lines[n + 1]?.trim() || "";
    for (const raw of tail.split(/\s*(?:[,;&]|\bés\b|\band\b)\s*/iu)) {
      const token = /^[\p{L}\d][\p{L}\d_.\/-]{2,29}/u.exec(raw)?.[0]?.replace(/[.]$/, "");
      if (!token || !/[a-z]/i.test(token) || !/\d/.test(token)) continue;
      const code = requirementCourseCode(token);
      if (code) found.add(code);
    }
  }
  return [...found];
}

/** Labelled code fields in requirement documents, including PDF text split across two lines. */
export function documentCourseCode(text: string): string | null {
  const found = documentCourseCodes(text);
  return found.length === 1 ? found[0] : null;
}

/** Use linked Canvas metadata only when it points to one subject code. */
export function linkedCourseCodes(course: Course, feeds: IcalFeed[]): string[] {
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
  return [...codes];
}

export function linkedCourseCode(course: Course, feeds: IcalFeed[]): string | null {
  const codes = linkedCourseCodes(course, feeds);
  return codes.length === 1 ? codes[0] : null;
}
