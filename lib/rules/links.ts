// How a requirement component is tied to the student's calendar: which classes, teaching weeks
// or deadlines are its instances. Links belong to the student, not to the subject (they name
// Neptun groups and feed deadlines), so they live next to the rules in
// RequirementRules.calendarLinks and never in a shared template. Pure.

import { normalizeSearch } from "@/lib/text";
import type { RetakeSlot, RuleComponent } from "./types";

export interface SessionSelector {
  groups?: string[]; // Neptun groups ("4"); empty = every group of the course
  kinds?: ("ora" | "vizsga")[]; // default ["ora"]
  fromWeek?: number;
  toWeek?: number;
  weekdays?: number[]; // 1 = Monday
}

export type ComponentLink =
  /** Every matching class ("every practice from week 2"), the first `limit` that took place. */
  | { mode: "sessions"; selector: SessionSelector; limit?: number; since?: string }
  /** Given teaching weeks ("zh in week 9"); the class of that week gives the date. */
  | { mode: "weeks"; weeks: number[]; selector?: SessionSelector; since?: string }
  /** Deadlines picked by the user (beadandó, Canvas quizzes), by deadlineIdentity. */
  | { mode: "deadlines"; identities: string[]; since?: string };

export type LinkMode = ComponentLink["mode"];

/** What can be linked: a rule component or a retake slot (the slot acts as a single exam). */
export type LinkTarget = RuleComponent | (RetakeSlot & { kind: "retake" });

/** Components with one result per class or item; the others have exactly one result ("n:1"). */
export function isMultiInstance(target: Pick<LinkTarget, "kind">): boolean {
  return target.kind === "attendance" || target.kind === "series";
}

/** The link modes that make sense for a component. Bonus points have no date. */
export function linkModes(target: Pick<LinkTarget, "kind">): LinkMode[] {
  switch (target.kind) {
    case "attendance":
      return ["sessions", "weeks"];
    case "series":
      return ["sessions", "weeks", "deadlines"];
    case "exam":
    case "retake":
      return ["weeks", "deadlines"];
    case "assignment":
      return ["deadlines", "weeks"];
    default:
      return [];
  }
}

export const LINK_LIMITS = { identities: 60, weeks: 30, groups: 20 } as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const intIn = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

function intList(v: unknown, min: number, max: number, cap: number): number[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is number => intIn(x, min, max)))].sort((a, b) => a - b).slice(0, cap);
}

function selectorFrom(v: unknown): SessionSelector {
  if (!isObj(v)) return {};
  const out: SessionSelector = {};
  if (Array.isArray(v.groups)) {
    const groups = [...new Set(v.groups.filter((g): g is string => typeof g === "string" && g.length > 0 && g.length <= 40))];
    if (groups.length) out.groups = groups.slice(0, LINK_LIMITS.groups);
  }
  if (Array.isArray(v.kinds)) {
    const kinds = [...new Set(v.kinds.filter((k): k is "ora" | "vizsga" => k === "ora" || k === "vizsga"))];
    if (kinds.length) out.kinds = kinds;
  }
  if (intIn(v.fromWeek, 1, 60)) out.fromWeek = v.fromWeek;
  if (intIn(v.toWeek, 1, 60)) out.toWeek = v.toWeek;
  const weekdays = intList(v.weekdays, 1, 7, 7);
  if (weekdays.length) out.weekdays = weekdays;
  return out;
}

const since = (v: unknown) => (typeof v === "string" && v.length <= 40 && Number.isFinite(Date.parse(v)) ? { since: v } : {});

/** One link from untrusted JSON, or null when it doesn't fit the component. */
export function linkFrom(v: unknown, target: Pick<LinkTarget, "kind">): ComponentLink | null {
  if (!isObj(v) || !linkModes(target).includes(v.mode as LinkMode)) return null;
  switch (v.mode) {
    case "sessions": {
      const limit = intIn(v.limit, 1, 200) ? { limit: v.limit } : {};
      return { mode: "sessions", selector: selectorFrom(v.selector), ...limit, ...since(v.since) };
    }
    case "weeks": {
      const weeks = intList(v.weeks, 1, 60, LINK_LIMITS.weeks);
      if (weeks.length === 0) return null;
      const selector = selectorFrom(v.selector);
      return { mode: "weeks", weeks, ...(Object.keys(selector).length > 0 && { selector }), ...since(v.since) };
    }
    case "deadlines": {
      if (!Array.isArray(v.identities)) return null;
      const identities = [...new Set(v.identities.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 300))];
      if (identities.length === 0) return null;
      return { mode: "deadlines", identities: identities.slice(0, isMultiInstance(target) ? LINK_LIMITS.identities : 1), ...since(v.since) };
    }
    default:
      return null;
  }
}

/** The links of a rule set from untrusted JSON: only for existing components, each one checked. */
export function linksFrom(
  value: unknown,
  rules: { components: RuleComponent[]; retakes: RetakeSlot[] }
): Record<string, ComponentLink> | undefined {
  if (!isObj(value)) return undefined;
  const targets = new Map<string, Pick<LinkTarget, "kind">>();
  for (const c of rules.components) targets.set(c.id, c);
  for (const r of rules.retakes) targets.set(r.id, { kind: "retake" });
  const out: Record<string, ComponentLink> = {};
  for (const [id, raw] of Object.entries(value)) {
    const target = targets.get(id);
    const link = target ? linkFrom(raw, target) : null;
    if (link) out[id] = link;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The rule components and retake slots as link targets, in display order. */
export function linkTargets(rules: { components: RuleComponent[]; retakes: RetakeSlot[] }): LinkTarget[] {
  return [...rules.components, ...rules.retakes.map((r) => ({ ...r, kind: "retake" as const }))];
}

const DEADLINE_WORDS: Partial<Record<LinkTarget["kind"], string[]>> = {
  series: ["kviz", "quiz", "teszt", "test"],
  assignment: ["beadando", "hazi", "hf", "assignment", "feladat", "projekt", "project", "homework"],
  exam: ["zh", "dolgozat", "exam", "vizsga", "midterm", "teszt"],
  retake: ["pot", "potzh", "javito", "retake"],
};

/**
 * Deadlines of the course that look like the component's items (by kind words), for the user to
 * confirm; never linked silently. Oldest first.
 */
export function suggestDeadlineLinks<D extends { courseId: string | null; title: string; due: string; done?: boolean }>(
  target: Pick<LinkTarget, "kind">,
  courseId: string,
  deadlines: D[]
): D[] {
  const words = DEADLINE_WORDS[target.kind] ?? [];
  return deadlines
    .filter((d) => d.courseId === courseId)
    .filter((d) => {
      const tokens = normalizeSearch(d.title).split(/[^a-z0-9]+/);
      return tokens.some((t) => words.includes(t));
    })
    .sort((a, b) => a.due.localeCompare(b.due));
}
