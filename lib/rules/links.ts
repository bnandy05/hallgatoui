// How a requirement component is tied to the student's calendar: which classes, teaching weeks
// or deadlines are its instances. Links belong to the student, not to the subject (they name
// Neptun groups and feed deadlines), so they live next to the rules in
// RequirementRules.calendarLinks and never in a shared template. Pure.

import { normalizeSearch } from "@/lib/text";
import { deadlineIdentity } from "@/lib/ical/dedupe";
import type { Deadline } from "@/lib/types";
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

/**
 * Class links that need no asking. Attendance is every class; a röpzh series is written at the
 * classes usually every week from the second (none in week 1), so it takes every class from week 2,
 * as many as the series has. Only when the course has classes, all of one Neptun group (with an
 * Ea and a Gy group in the same course the right one is not known). Components in `skip` (linked
 * already, or decided once) are left alone.
 */
export function defaultLinks(
  components: RuleComponent[],
  skip: Set<string>,
  courseSessions: { kind: string; group?: string }[],
  since: string
): Record<string, ComponentLink> {
  const classes = courseSessions.filter((s) => s.kind === "ora");
  if (classes.length === 0 || new Set(classes.map((s) => s.group ?? "")).size > 1) return {};
  const out: Record<string, ComponentLink> = {};
  for (const c of components) {
    if (skip.has(c.id)) continue;
    if (c.kind === "attendance") out[c.id] = { mode: "sessions", selector: {}, since };
    if (c.kind === "series" && c.item === "ropzh") out[c.id] = { mode: "sessions", selector: { fromWeek: 2 }, since };
  }
  return out;
}

/**
 * The links a rule set gets by itself: `defaultLinks` and `defaultDeadlineLinks` for every
 * component that has no link and was never auto-linked or set by hand (`autoLinked`), so data
 * that arrives later (a timetable import, a feed sync) links what it makes clear, and a link the
 * user removed stays removed. A series or attendance with results entered without a link
 * (numbered "n:" keys) is left alone too: a link would move them aside as "Kapcsolat nélküli eredmények".
 */
export function autoLinks(
  rules: { courseId: string; components: RuleComponent[]; calendarLinks?: Record<string, ComponentLink>; autoLinked?: string[] },
  sessions: { courseId: string | null; kind: string; group?: string }[],
  deadlines: Deadline[],
  results: { courseId: string; componentId: string; instanceKey: string }[],
  since: string
): Record<string, ComponentLink> {
  const skip = new Set([...Object.keys(rules.calendarLinks ?? {}), ...(rules.autoLinked ?? [])]);
  // Single-result components keep "n:1" under any link; only series and attendance would move.
  const multi = new Set(rules.components.filter(isMultiInstance).map((c) => c.id));
  for (const r of results) if (r.courseId === rules.courseId && multi.has(r.componentId) && r.instanceKey.startsWith("n:")) skip.add(r.componentId);
  if (rules.components.every((c) => skip.has(c.id))) return {};
  const own = sessions.filter((s) => s.courseId === rules.courseId);
  return {
    ...defaultLinks(rules.components, skip, own, since),
    ...defaultDeadlineLinks(rules.components, skip, rules.courseId, deadlines, since),
  };
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

const RETAKE_WORDS = new Set(["pot", "potzh", "javito", "javitozh", "retake"]);
/** Words and numbers of a title: "ZH1 (pót)" → zh, 1, pot. */
const tokensOf = (text: string): string[] => normalizeSearch(text).match(/[a-z]+|\d+/g) ?? [];
const numbersOf = (text: string) => tokensOf(text).filter((t) => /^\d+$/.test(t)).map((t) => String(Number(t)));

/**
 * Deadline links that need no asking. A component whose label names its kind ("1. beadandó",
 * "2. zh", "Zh") is linked to the course's deadlines with the same word ("Beadandó 1 – WinForms",
 * "ZH2"), retakes left out: first by number, where exactly one deadline carries the component's
 * number and no sibling claims it; the rest in order of due date when as many deadlines are left
 * as components. A quiz series takes the quiz deadlines when there are exactly as many. Anything
 * less clear stays for the link dialog. Components in `skip` keep what they have.
 */
export function defaultDeadlineLinks(
  components: RuleComponent[],
  skip: Set<string>,
  courseId: string,
  deadlines: Deadline[],
  since: string
): Record<string, ComponentLink> {
  const own = deadlines
    .filter((d) => d.courseId === courseId)
    .map((d) => ({ d, tokens: tokensOf(d.title), numbers: numbersOf(d.title) }))
    .filter((x) => !x.tokens.some((t) => RETAKE_WORDS.has(t)))
    .sort((a, b) => a.d.due.localeCompare(b.d.due));
  const out: Record<string, ComponentLink> = {};
  const link = (id: string, ds: Deadline[]) => {
    if (!skip.has(id)) out[id] = { mode: "deadlines", identities: ds.map(deadlineIdentity), since };
  };
  const used = new Set<Deadline>();
  const done = new Set<string>();

  for (const kind of ["assignment", "exam"] as const) {
    const words = DEADLINE_WORDS[kind] ?? [];
    for (const word of words) {
      const comps = components.filter((c) => c.kind === kind && !done.has(c.id) && tokensOf(c.label).includes(word));
      if (comps.length === 0) continue;
      let cands = own.filter((x) => !used.has(x.d) && x.tokens.includes(word));
      const assigned = new Map<string, Deadline>();
      for (const c of comps) {
        const n = numbersOf(c.label)[0];
        if (n === undefined) continue;
        const hits = cands.filter((x) => x.numbers.includes(n));
        const claimed = (x: (typeof cands)[number]) => comps.some((o) => o !== c && numbersOf(o.label).some((m) => x.numbers.includes(m)));
        if (hits.length === 1 && !claimed(hits[0])) assigned.set(c.id, hits[0].d);
      }
      cands = cands.filter((x) => ![...assigned.values()].includes(x.d));
      const rest = comps.filter((c) => !assigned.has(c.id));
      if (rest.length > 0 && rest.length === cands.length) rest.forEach((c, i) => assigned.set(c.id, cands[i].d));
      for (const [id, d] of assigned) {
        used.add(d);
        done.add(id);
        link(id, [d]);
      }
    }
  }

  for (const c of components) {
    if (c.kind !== "series" || c.item !== "quiz") continue;
    const words = DEADLINE_WORDS.series ?? [];
    const quizzes = own.filter((x) => !used.has(x.d) && x.tokens.some((t) => words.includes(t)));
    if (quizzes.length === c.count) link(c.id, quizzes.map((x) => x.d));
  }
  return out;
}
