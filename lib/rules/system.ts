import type { Course } from "@/lib/types";
import type { RequirementResult, RequirementRules, SubjectRules } from "./types";
import { resultId } from "./types";
import { normalizeSemester } from "./shared";

export const systemCourseIds = (rules: Pick<RequirementRules, "courseId" | "courseIds">): string[] =>
  [...new Set([rules.courseId, ...(rules.courseIds ?? [])])];

export function rulesForCourse(rules: RequirementRules[], courseId: string): RequirementRules | undefined {
  return rules.find((r) => systemCourseIds(r).includes(courseId));
}

export function componentCourseIds(rules: Pick<RequirementRules, "courseId" | "courseIds" | "componentCourses">, componentId: string): string[] {
  const members = systemCourseIds(rules);
  return rules.componentCourses?.[componentId]?.filter((id) => members.includes(id)) ?? (members.length === 1 ? members : []);
}

export function subjectRules(rules: SubjectRules): SubjectRules {
  const { schemaVersion, components, retakes, derived, tables, outcomes, flags, examEligibility } = rules;
  return { schemaVersion, components, retakes, derived, tables, outcomes, flags, ...(examEligibility?.length && { examEligibility }) };
}

export function sameSemester(a: Course, b: Course): boolean {
  return !a.semester || !b.semester || normalizeSemester(a.semester, new Date()) === normalizeSemester(b.semester, new Date());
}

const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value && typeof value === "object"
  ? `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`
  : JSON.stringify(value) ?? "null";
const comparable = (r: RequirementResult) => stable([r.state, r.value, r.retakeOf]);
const definition = (rules: SubjectRules, id: string) => rules.components.find((c) => c.id === id) ?? rules.retakes.find((c) => c.id === id);
// Ignore labels/notes when matching an existing result to the selected rules; scoring must match.
function compatible(a: unknown, b: unknown): boolean {
  if (!a || !b) return false;
  const clean = (v: unknown) => { const { label: _l, note: _n, ...rest } = v as Record<string, unknown>; void _l; void _n; return rest; };
  const old = clean(a);
  const next = clean(b);
  // An attendance entry is a fact about the class, even if the permitted absence count changes.
  if (old.kind === "attendance" && next.kind === "attendance") return true;
  return stable(old) === stable(next);
}
export interface SystemConflict { key: string; componentId: string; instanceKey: string; options: RequirementResult[] }
export interface SystemPlan {
  rules: RequirementRules;
  conflicts: SystemConflict[];
  results: RequirementResult[];
  previousSystems: NonNullable<RequirementRules["previousSystems"]>;
  affected: RequirementRules[];
  consumedIds: string[];
}

/** Pure merge preview. Existing incompatible definitions stay available in read-only history. */
export function planRequirementSystem(allRules: RequirementRules[], allResults: RequirementResult[], selected: RequirementRules,
  memberIds: string[], scopes: Record<string, string[]>, choices: Record<string, string> = {}): SystemPlan {
  const members = [...new Set([selected.courseId, ...memberIds])];
  const affected = allRules.filter((r) => systemCourseIds(r).some((id) => members.includes(id)));
  // A member of an existing shared system always brings its complete system along.
  for (const r of affected) for (const id of systemCourseIds(r)) if (!members.includes(id)) members.push(id);
  const snapshots = affected.flatMap((r) => {
    const { previousSystems: old, ...snapshot } = r;
    const changed = affected.length > 1 || stable(subjectRules(r)) !== stable(subjectRules(selected)) || stable(systemCourseIds(r).sort()) !== stable([...members].sort()) || stable(r.componentCourses) !== stable(scopes);
    return [...(old ?? []), ...(changed ? [{ rules: snapshot, results: allResults.filter((v) => v.courseId === r.courseId) }] : [])];
  });
  const previousSystems = snapshots.filter((s, index) => snapshots.findIndex((other) => JSON.stringify(other) === JSON.stringify(s)) === index);
  const byKey = new Map<string, RequirementResult[]>();
  for (const r of affected) for (const result of allResults.filter((v) => v.courseId === r.courseId)) {
    if (!compatible(definition(selected, result.componentId), definition(r, result.componentId))) continue;
    const assigned = scopes[result.componentId] ?? (members.length === 1 ? members : []);
    const oldAssigned = componentCourseIds(r, result.componentId);
    if (!oldAssigned.some((id) => assigned.includes(id)) && (r.courseId !== selected.courseId || selected.components.find((c) => c.id === result.componentId)?.kind === "attendance")) continue;
    const key = resultId(selected.courseId, result.componentId, result.instanceKey);
    byKey.set(key, [...(byKey.get(key) ?? []), result]);
  }
  // Freshly extracted rules may not yet exist in allRules.
  if (!affected.some((r) => r.courseId === selected.courseId)) {
    for (const r of allResults.filter((v) => v.courseId === selected.courseId && definition(selected, v.componentId))) {
      const key = resultId(selected.courseId, r.componentId, r.instanceKey);
      byKey.set(key, [r]);
    }
  }
  const conflicts: SystemConflict[] = [];
  const results: RequirementResult[] = [];
  for (const [key, options] of byKey) {
    const different = new Set(options.map(comparable)).size > 1;
    if (different) conflicts.push({ key, componentId: options[0].componentId, instanceKey: options[0].instanceKey, options });
    const winner = options.find((r) => r.id === choices[key]) ?? options.find((r) => r.courseId === selected.courseId) ?? options[0];
    results.push({ ...winner, id: key, courseId: selected.courseId });
  }
  const calendarLinks: RequirementRules["calendarLinks"] = {};
  const autoLinked = new Set<string>();
  const selectedTargets = [...selected.components, ...selected.retakes];
  for (const target of selectedTargets) {
    const assigned = scopes[target.id] ?? [];
    const source = affected.find((r) => {
      const oldScope = componentCourseIds(r, target.id);
      const previous = definition(r, target.id);
      const kind = (item: typeof target) => "kind" in item ? item.kind : "retake";
      return oldScope.length === assigned.length && oldScope.every((id) => assigned.includes(id))
        && previous && kind(target) === kind(previous) && (r.calendarLinks?.[target.id] || r.autoLinked?.includes(target.id));
    });
    const link = source?.calendarLinks?.[target.id];
    if (link) calendarLinks[target.id] = link;
    if (source?.autoLinked?.includes(target.id)) autoLinked.add(target.id);
  }
  return {
    rules: { ...selected, courseIds: members, componentCourses: scopes, calendarLinks, autoLinked: [...autoLinked] },
    conflicts, results, previousSystems, affected,
    consumedIds: [...byKey.values()].flatMap((items) => items.map((r) => r.id)),
  };
}

/** A member can be deleted without deleting the shared ledger of its surviving courses. */
export function removeRequirementCourse(rules: RequirementRules[], results: RequirementResult[], deleted: string) {
  const remaining: RequirementRules[] = [];
  let nextResults = results.filter((r) => r.courseId !== deleted);
  for (const r of rules) {
    if (!systemCourseIds(r).includes(deleted)) { remaining.push(r); continue; }
    const members = systemCourseIds(r).filter((id) => id !== deleted);
    if (!members.length) continue;
    const owner = r.courseId === deleted ? members[0] : r.courseId;
    remaining.push({ ...r, id: `rules:${owner}`, courseId: owner, courseIds: members,
      componentCourses: Object.fromEntries(Object.entries(r.componentCourses ?? {}).map(([id, ids]) => [id, ids.filter((x) => x !== deleted)])) });
    if (owner !== r.courseId) nextResults = [...nextResults, ...results.filter((v) => v.courseId === r.courseId).map((v) => ({ ...v, courseId: owner, id: resultId(owner, v.componentId, v.instanceKey) }))];
  }
  return { requirementRules: remaining, requirementResults: nextResults };
}

/** Prefer exact subject identities/names, never infer related subjects by trimming code suffixes. */
export function relatedCourseScore(a: Course, b: Course, codes: string[] = []): number {
  if (!sameSemester(a, b)) return -1;
  const base = (name: string) => name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    .replace(/\s+(ea|gy|lab|eloadas|gyakorlat|labor)\.?\s*$/, "").replace(/[.\s]+$/g, "").trim();
  const values = (c: Course) => c.codes?.map((v) => v.code) ?? c.code?.split(/[,;]+/).map((v) => v.trim().replace(/\s+\d{1,4}$/, "").toUpperCase()) ?? [];
  const aCodes = values(a);
  const bCodes = values(b);
  return (bCodes.some((c) => codes.includes(c)) ? 4 : 0) + (bCodes.some((c) => aCodes.includes(c)) ? 3 : 0) + (base(a.name) === base(b.name) ? 2 : 0);
}

/** Concurrent joins can overlap. Keep one graph and preserve the other graphs for review. */
export function resolveOverlappingSystems(rules: RequirementRules[], results: RequirementResult[]): RequirementRules[] {
  const out: RequirementRules[] = [];
  for (const r of [...rules].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))) {
    const overlaps = out.filter((other) => systemCourseIds(other).some((id) => systemCourseIds(r).includes(id)));
    if (!overlaps.length) { out.push(r); continue; }
    const winner = overlaps[0];
    const others = [r, ...overlaps.slice(1)];
    const members = [...new Set([...(systemCourseIds(winner)), ...others.flatMap(systemCourseIds)])];
    const snapshots = [...(winner.previousSystems ?? []), ...others.flatMap((system) => {
      const { previousSystems, ...snapshot } = system;
      return [...(previousSystems ?? []), { rules: snapshot, results: results.filter((v) => v.courseId === system.courseId) }];
    })];
    const next: RequirementRules = { ...winner, courseIds: members,
      componentCourses: Object.fromEntries([...winner.components, ...winner.retakes].map((c) => [c.id, componentCourseIds(winner, c.id)])),
      previousSystems: snapshots,
      flags: [...winner.flags.filter((f) => f.code !== "sharedSystemConflict"), {
        field: "courseIds", code: "sharedSystemConflict", resolved: false,
        message: "Több eszközön eltérő kurzuskapcsolatok jöttek létre. Ellenőrizd a közös szabályokat; a többi változat és eredményei az előzményekben megmaradtak.",
      }],
    };
    for (const old of overlaps) out.splice(out.indexOf(old), 1);
    out.push(next);
  }
  // Preserve the original list/reference on the ordinary path.
  return out.length === rules.length ? rules : out;
}
