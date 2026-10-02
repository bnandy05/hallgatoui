import type { CanvasContext, CourseKind } from "@/lib/types";
import type { IcalEventDTO } from "@/lib/ical/types";

export type { CanvasContext, CourseKind };

export interface CanvasEventInfo {
  context: CanvasContext | null;
  cleanTitle: string; // summary without course suffixes
  assignmentUrl?: string;
}

const TRAILING_BRACKET = /\[([^[\]]+)\]\s*$/;
const LABEL_PATTERN = /^(\d{4}\/\d{2}\/\d)\s+(.+?)\s+-\s+(.+)$/;
const KIND_PATTERN = /\s+(Ea|Gy|Lab)\.?$/i;
const SEMESTER_IN_TEXT = /\d{4}\/\d{2}\/\d/;

const KIND_LABELS: Record<CourseKind, string> = {
  Ea: "Előadás",
  Gy: "Gyakorlat",
  Lab: "Labor",
};

export function formatKindLabel(kind: CourseKind): string {
  return KIND_LABELS[kind];
}

/** Lowercase, dots removed, whitespace collapsed; used to group Ea/Gy variants. */
export function normalizeCourseName(name: string): string {
  return name.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

function normalizeKind(raw: string): CourseKind {
  const lower = raw.toLowerCase();
  return lower === "ea" ? "Ea" : lower === "gy" ? "Gy" : "Lab";
}

/** Strips the trailing "[context]" and a trailing "(… 2026/27/1 …)" from a Canvas summary. */
export function cleanCanvasTitle(summary: string): string {
  let title = summary.replace(TRAILING_BRACKET, "").trim();
  const paren = title.match(/\(([^()]*)\)\s*$/);
  if (paren && SEMESTER_IN_TEXT.test(paren[1])) {
    title = title.slice(0, paren.index).trim();
  }
  title = title.replace(/\s+/g, " ").trim();
  return title || summary;
}

function parseLabel(label: string): Pick<
  CanvasContext,
  "semester" | "code" | "name" | "baseName" | "groupKey" | "kind"
> {
  const match = label.match(LABEL_PATTERN);
  const semester = match?.[1];
  const code = match?.[2];
  const name = match ? match[3].trim() : label;

  const kindMatch = name.match(KIND_PATTERN);
  const kind = kindMatch ? normalizeKind(kindMatch[1]) : undefined;
  const stripped = kindMatch ? name.slice(0, kindMatch.index) : name;
  const baseName = stripped.replace(/[.\s]+$/, "").trim() || name;

  return { semester, code, name, baseName, groupKey: normalizeCourseName(baseName), kind };
}

function parseUrl(url: string | undefined): { origin?: string; courseId?: string; assignmentId?: string } {
  if (!url) return {};
  try {
    const parsed = new URL(url);
    const courseId = parsed.searchParams.get("include_contexts")?.match(/course_(\d+)/)?.[1];
    const assignmentId = parsed.hash.match(/^#assignment_(\d+)/)?.[1];
    return { origin: parsed.origin, courseId, assignmentId };
  } catch {
    return {};
  }
}

/**
 * Extracts the Canvas course context and a cleaned title from an event.
 * Pure and safe for non-Canvas events: without a trailing "[…]" the context is
 * null and the title is unchanged.
 */
export function parseCanvasEvent(event: IcalEventDTO): CanvasEventInfo {
  const { origin, courseId, assignmentId: hashId } = parseUrl(event.url);
  const bracket = event.summary.match(TRAILING_BRACKET);

  let context: CanvasContext | null = null;
  if (bracket) {
    const label = bracket[1].trim();
    const courseUrl = origin && courseId ? `${origin}/courses/${courseId}` : undefined;
    context = {
      key: origin && courseId ? `canvas:${new URL(origin).host}:${courseId}` : `label:${label}`,
      label,
      ...parseLabel(label),
      courseUrl,
    };
  }

  const assignmentId = hashId ?? event.uid.match(/^event-assignment-(\d+)$/)?.[1];
  const assignmentUrl =
    origin && courseId && assignmentId
      ? `${origin}/courses/${courseId}/assignments/${assignmentId}`
      : undefined;

  return {
    context,
    cleanTitle: context ? cleanCanvasTitle(event.summary) : event.summary,
    assignmentUrl,
  };
}
