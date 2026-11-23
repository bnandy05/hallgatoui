import { deadlineIdentity } from "@/lib/ical/dedupe";
import type { ClassSession, Deadline, SemesterInfo } from "@/lib/types";
import { formulaReferences, parseFormula } from "./expr";
import { resolveInstances } from "./instances";
import { linkTargets, type ComponentLink } from "./links";
import { componentCourseIds, subjectRules, systemCourseIds } from "./system";
import { resultId, type Outcome, type RequirementResult, type RequirementRules } from "./types";

interface SplitContext {
  sessions: ClassSession[];
  deadlines: Deadline[];
  semester?: SemesterInfo;
  results: RequirementResult[];
}

export interface SplitSide {
  rules: RequirementRules;
  results: RequirementResult[];
}

export interface RequirementSplit {
  remaining: SplitSide;
  detached: SplitSide;
  originals: RequirementResult[];
  historyOnly: RequirementResult[];
  historyOutcomes: Outcome[];
}

function canUse(formula: string | undefined, known: Set<string>): boolean {
  if (formula === undefined) return true;
  const parsed = parseFormula(formula);
  return parsed.ok && formulaReferences(parsed.ast).every((id) => known.has(id));
}

function independentRules(original: RequirementRules, scopes: Record<string, string[]>, retainUnassigned: boolean) {
  const base = subjectRules(original);
  const keep = (id: string) => scopes[id]?.length || (retainUnassigned && !componentCourseIds(original, id).length);
  const components = base.components.filter((c) => keep(c.id));
  const known = new Set(components.map((c) => c.id));
  const retakes = base.retakes.filter((r) => keep(r.id) && r.targets.every((id) => known.has(id)) && canUse(r.eligible, known));
  retakes.forEach((r) => known.add(r.id));
  base.tables.forEach((table) => known.add(table.id));
  const derived = base.derived.filter((d) => {
    if (!canUse(d.expr, known)) return false;
    known.add(d.id);
    return true;
  });
  const lostAttendanceGate = base.components.some((c) => c.kind === "attendance" && c.limit && !known.has(c.id));
  const outcomes = base.outcomes.filter((o) => {
    if (o.kind === "gyakorlat" && lostAttendanceGate) return false;
    if (o.gates?.some((g) => !canUse(g.test, known))) return false;
    if (o.paths.some((p) => !canUse(p.when, known) || !canUse(p.grade, known)
      || p.gates?.some((g) => !canUse(g.test, known)) || p.post?.some((step) => step.kind === "add" && !canUse(step.when, known)))) return false;
    known.add(o.id);
    return true;
  });
  // All the original admission conditions have to survive together.
  const examEligibility = base.examEligibility?.every((g) => canUse(g.test, known)) ? base.examEligibility : undefined;
  const flags = base.flags.filter((flag) => {
    const [, entity] = flag.field.split(".");
    return !entity || known.has(entity);
  });

  return { ...base, components, retakes, derived, outcomes, flags, examEligibility };
}

/** Keep class and deadline ownership, and retain an exact historical copy of the shared ledger. */
export function previewRequirementSplit(original: RequirementRules, detachedId: string, context: SplitContext): RequirementSplit | undefined {
  const members = systemCourseIds(original);
  if (members.length < 2 || !members.includes(detachedId)) return undefined;
  const remainingIds = members.filter((id) => id !== detachedId);
  const remainingOwner = remainingIds.includes(original.courseId) ? original.courseId : remainingIds[0];
  const targets = linkTargets(original);
  const originalIds = new Set(targets.map((c) => c.id));
  const originals = context.results.filter((r) => r.courseId === original.courseId && originalIds.has(r.componentId));
  const { previousSystems, ...savedRules } = original;
  const history = [...(previousSystems ?? []), { rules: savedRules, results: originals }];
  const deadlinesByIdentity = new Map(context.deadlines.map((d) => [deadlineIdentity(d), d.courseId]));
  const sessionsByUid = new Map(context.sessions.map((s) => [s.externalUid, s.courseId]));
  const courseByInstance = new Map<string, string>();
  for (const target of targets) {
    for (const instance of resolveInstances(target, original.calendarLinks?.[target.id], {
      ...context, courseId: original.courseId, courseIds: componentCourseIds(original, target.id),
    })) {
      const course = instance.session?.courseId ?? instance.deadline?.courseId;
      if (course) courseByInstance.set(`${target.id}|${instance.key}`, course);
    }
  }

  function side(ids: string[], owner: string, remaining: boolean): SplitSide {
    const scopes = Object.fromEntries(targets.map((c) => [c.id, componentCourseIds(original, c.id).filter((id) => ids.includes(id))]));
    const filtered = independentRules(original, scopes, remaining);
    const active = linkTargets(filtered);
    const calendarLinks: Record<string, ComponentLink> = {};
    for (const c of active) {
      const link = original.calendarLinks?.[c.id];
      if (!link || !scopes[c.id].length) continue;
      if (link.mode !== "deadlines") {
        calendarLinks[c.id] = link;
        continue;
      }
      const identities = link.identities.filter((id) => {
        const course = deadlinesByIdentity.get(id);
        return course ? ids.includes(course) : remaining || componentCourseIds(original, c.id).every((scope) => ids.includes(scope));
      });
      if (identities.length) calendarLinks[c.id] = { ...link, identities };
    }
    const resultIds = new Set(active.map((c) => c.id));
    const results = originals.flatMap((r): RequirementResult[] => {
      const linkedCourse = courseByInstance.get(`${r.componentId}|${r.instanceKey}`);
      const pinnedCourse = r.instanceKey.startsWith("s:") ? sessionsByUid.get(r.instanceKey.slice(2))
        : r.instanceKey.startsWith("d:") ? deadlinesByIdentity.get(r.instanceKey.slice(2)) : undefined;
      const instanceCourse = linkedCourse ?? pinnedCourse;
      const assignment = componentCourseIds(original, r.componentId);
      const destination = instanceCourse ?? (assignment.length === 1 ? assignment[0] : remainingOwner);
      if (!ids.includes(destination) || !resultIds.has(r.componentId)) return [];
      return [{ ...r, courseId: owner, id: resultId(owner, r.componentId, r.instanceKey) }];
    });
    return {
      rules: {
        ...filtered, id: `rules:${owner}`, courseId: owner, courseIds: ids,
        componentCourses: Object.fromEntries(active.map((c) => [c.id, scopes[c.id]])),
        calendarLinks, autoLinked: original.autoLinked?.filter((id) => resultIds.has(id)),
        source: original.source, templateId: original.templateId, previousSystems: history,
      },
      results,
    };
  }

  const remaining = side(remainingIds, remainingOwner, true);
  const detached = side([detachedId], detachedId, false);
  // Retained results outside the active ledger can already occupy a destination key.
  const originalsById = new Set(originals.map((r) => r.id));
  const reservedIds = new Set(context.results.filter((r) => !originalsById.has(r.id)).map((r) => r.id));
  for (const tracker of [remaining, detached]) tracker.results = tracker.results.filter((r) => !reservedIds.has(r.id));

  const placed = new Set([...remaining.results, ...detached.results].map((r) => `${r.componentId}|${r.instanceKey}`));
  const activeOutcomes = new Set([...remaining.rules.outcomes, ...detached.rules.outcomes].map((o) => o.id));
  return {
    remaining, detached, originals,
    historyOnly: originals.filter((r) => !placed.has(`${r.componentId}|${r.instanceKey}`)),
    historyOutcomes: original.outcomes.filter((o) => !activeOutcomes.has(o.id)),
  };
}
