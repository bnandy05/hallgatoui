import type { AppStore, StoreSet } from "@/lib/store";
import { resultId, type RequirementResult, type RequirementRules } from "@/lib/rules/types";
import { normalizeSemesterStart } from "@/lib/timetable/semester";
import { reconcileAttendance } from "@/lib/attendance";
import { componentCourseIds, planRequirementSystem, rulesForCourse, sameSemester, systemCourseIds } from "@/lib/rules/system";
import { previewRequirementSplit } from "@/lib/rules/splitSystem";
import { same } from "@/lib/sync/merge";
import { syncNow } from "@/lib/sync/clock";

type RequirementActions = Pick<AppStore,
  "splitRequirementSystem" | "undoRequirementSplit" | "configureRequirementSystem" | "setAttendancePrefs" | "reconcileAttendance" | "setRequirementRules" | "setRequirementResult" | "setRequirementResults" |
  "setComponentLink" | "applyAutoLinks" | "setSemester" | "markCatchUpPrompted" | "setBellAlertKinds"
>;

export function requirementActions(set: StoreSet): RequirementActions {
  return {
    splitRequirementSystem: (original, detachedId, expectedResults) => {
      let saved = false;
      set((state) => {
        if (state.requirementResults !== expectedResults || !state.requirementRules.includes(original)) return state;
        const plan = previewRequirementSplit(original, detachedId, {
          sessions: state.classSessions, deadlines: state.deadlines, semester: state.semester, results: state.requirementResults,
        });
        if (!plan) return state;
        const removed = new Set(plan.originals.map((r) => r.id));
        saved = true;
        return {
          requirementRules: [...state.requirementRules.filter((r) => r !== original), plan.remaining.rules, plan.detached.rules],
          requirementResults: [...state.requirementResults.filter((r) => !removed.has(r.id)), ...plan.remaining.results, ...plan.detached.results],
        };
      });
      return saved;
    },
    undoRequirementSplit: (original, originals, split, splitResults, movedIds) => {
      let saved = false;
      set((state) => {
        const ids = new Set(split.map((r) => r.id));
        const owners = new Set(split.map((r) => r.courseId));
        const current = state.requirementRules.filter((r) => ids.has(r.id));
        const results = state.requirementResults.filter((r) => owners.has(r.courseId));
        if (split.length !== 2 || !same(current, split) || !same(results, splitResults)) return state;
        const replaced = new Set([...movedIds, ...originals.map((result) => result.id)]);
        saved = true;
        return {
          requirementRules: [...state.requirementRules.filter((r) => !ids.has(r.id)), original],
          requirementResults: [...state.requirementResults.filter((r) => !replaced.has(r.id)), ...originals],
        };
      });
      return saved;
    },
    configureRequirementSystem: (selected, members, scopes, choices = {}) => {
      let saved = false;
      set((state) => {
        const owner = state.courses.find((c) => c.id === selected.courseId);
        if (!owner || members.length > 20 || !members.includes(owner.id) || members.some((id) => !state.courses.some((c) => c.id === id && sameSemester(c, owner)))) return state;
        const plan = planRequirementSystem(state.requirementRules, state.requirementResults, selected, members, scopes, choices);
        if (systemCourseIds(plan.rules).some((id) => !members.includes(id)) || plan.conflicts.some((c) => !c.options.some((o) => o.id === choices[c.key]))) return state;
        const affectedIds = new Set(plan.affected.map((r) => r.id));
        const isOwned = (r: RequirementResult) => plan.affected.some((s) => s.courseId === r.courseId && [...s.components, ...s.retakes].some((c) => c.id === r.componentId));
        const used = new Set(plan.consumedIds);
        const historicalAttendance = state.requirementResults.filter((r) => isOwned(r) && plan.affected.some((s) => s.courseId === r.courseId && s.components.some((c) => c.id === r.componentId && c.kind === "attendance")) && !used.has(r.id)).map((r) => {
          let hash = 2166136261;
          for (const c of `${r.courseId}|${r.componentId}`) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
          const componentId = `attendance_legacy_${(hash >>> 0).toString(36)}`;
          const original = plan.affected.find((s) => s.courseId === r.courseId)!;
          const scope = componentCourseIds(original, r.componentId);
          const session = r.instanceKey.startsWith("s:") ? state.classSessions.find((s) => s.externalUid === r.instanceKey.slice(2)) : undefined;
          const courseId = session?.courseId ?? (scope.length === 1 ? scope[0] : r.courseId);
          return { ...r, courseId, componentId, id: resultId(courseId, componentId, r.instanceKey) };
        });
        saved = true;
        return {
          requirementRules: [...state.requirementRules.filter((r) => !affectedIds.has(r.id)), {
            ...plan.rules, id: `rules:${selected.courseId}`, previousSystems: plan.previousSystems,
          }],
          requirementResults: [...state.requirementResults.filter((r) => !isOwned(r) && !plan.results.some((v) => v.id === r.id)), ...historicalAttendance, ...plan.results],
        };
      });
      return saved;
    },
    setAttendancePrefs: (enabled) => set((state) => ({ attendancePrefs: {
      enabled, since: state.attendancePrefs?.since ?? syncNow(), updatedAt: syncNow(),
    } })),
    reconcileAttendance: () => set((state) => {
      const results = reconcileAttendance({ courses: state.courses, sessions: state.classSessions,
        rules: state.requirementRules, results: state.requirementResults, semester: state.semester });
      return results === state.requirementResults ? state : { requirementResults: results };
    }),
    setRequirementRules: (courseId, rules) => {
      set((state) => {
        const previous = rulesForCourse(state.requirementRules, courseId);
        const owner = previous?.courseId ?? courseId;
        const id = `rules:${owner}`;
        const rest = state.requirementRules.filter((r) => r.id !== id);
        if (!rules) return { requirementRules: rest };
        const { updatedAt: _u, calendarLinks: _l, autoLinked: _a, ...clean } = rules as RequirementRules;
        void _u;
        void _l;
        void _a;
        // Editing the rules keeps the calendar links of the components that are still there, and
        // what was decided about them (`autoLinked`); new components are linked by
        // `RequirementAutoLink` once the data makes it clear.
        const ids = new Set([...clean.components.map((c) => c.id), ...clean.retakes.map((r) => r.id)]);
        const kept = Object.entries(previous?.calendarLinks ?? {}).filter(([cid]) => ids.has(cid));
        const decided = (previous?.autoLinked ?? []).filter((cid) => ids.has(cid));
        const next: RequirementRules = {
          ...clean,
          id,
          courseId: owner,
          ...(previous?.courseIds && { courseIds: previous.courseIds }),
          ...(previous?.componentCourses && { componentCourses: Object.fromEntries(Object.entries(previous.componentCourses).filter(([id]) => ids.has(id))) }),
          ...(previous?.previousSystems && { previousSystems: previous.previousSystems }),
          ...(kept.length > 0 && { calendarLinks: Object.fromEntries(kept) }),
          ...(decided.length > 0 && { autoLinked: decided }),
        };
        return { requirementRules: [...rest, next] };
      });
    },
    setRequirementResult: (courseId, componentId, instanceKey, patch) => {
      set((state) => {
        const system = rulesForCourse(state.requirementRules, courseId);
        const owner = system && [...system.components, ...system.retakes].some((c) => c.id === componentId) ? system.courseId : courseId;
        const id = resultId(owner, componentId, instanceKey);
        const rest = state.requirementResults.filter((r) => r.id !== id);
        if (!patch) return { requirementResults: rest };
        const result: RequirementResult = { id, courseId: owner, componentId, instanceKey, ...patch };
        if (result.state !== "recorded") delete result.value;
        return { requirementResults: [...rest, result] };
      });
    },
    setRequirementResults: (items) => {
      if (items.length === 0) return;
      set((state) => {
        const byId = new Map(state.requirementResults.map((r) => [r.id, r]));
        for (const { courseId, componentId, instanceKey, patch } of items) {
          const system = rulesForCourse(state.requirementRules, courseId);
          const owner = system && [...system.components, ...system.retakes].some((c) => c.id === componentId) ? system.courseId : courseId;
          const id = resultId(owner, componentId, instanceKey);
          if (!patch) {
            byId.delete(id);
            continue;
          }
          const result: RequirementResult = { id, courseId: owner, componentId, instanceKey, ...patch };
          if (result.state !== "recorded") delete result.value;
          byId.set(id, result);
        }
        return { requirementResults: [...byId.values()] };
      });
    },
    setComponentLink: (courseId, componentId, link) => {
      set((state) => {
        const rules = rulesForCourse(state.requirementRules, courseId);
        if (!rules) return state;
        const links = { ...rules.calendarLinks };
        if (link) links[componentId] = link;
        else delete links[componentId];
        const { calendarLinks: _old, ...rest } = rules;
        void _old;
        // The user decided: the auto-linker never touches this component again.
        const autoLinked = [...new Set([...(rules.autoLinked ?? []), componentId])];
        const next: RequirementRules = { ...rest, autoLinked, ...(Object.keys(links).length > 0 && { calendarLinks: links }) };
        return { requirementRules: state.requirementRules.map((r) => (r.id === rules.id ? next : r)) };
      });
    },
    applyAutoLinks: (courseId, links) => {
      set((state) => {
        const rules = rulesForCourse(state.requirementRules, courseId);
        if (!rules) return state;
        const fresh = Object.entries(links).filter(([cid]) => !rules.calendarLinks?.[cid] && !rules.autoLinked?.includes(cid));
        if (fresh.length === 0) return state;
        const next: RequirementRules = {
          ...rules,
          calendarLinks: { ...rules.calendarLinks, ...Object.fromEntries(fresh) },
          autoLinked: [...(rules.autoLinked ?? []), ...fresh.map(([cid]) => cid)],
        };
        return { requirementRules: state.requirementRules.map((r) => (r.id === rules.id ? next : r)) };
      });
    },
    setSemester: (start) => {
      const normalized = start ? normalizeSemesterStart(start) : null;
      if (start && !normalized) return;
      // A scalar, not a list item: stamped here instead of by trackChanges.
      set({ semester: normalized ? { start: normalized, updatedAt: syncNow() } : undefined });
    },
    markCatchUpPrompted: () => {
      set({ catchUp: { promptedUntil: syncNow() } });
    },
    setBellAlertKinds: (kinds) => {
      // A scalar, not a list item: stamped here instead of by trackChanges.
      set({ alertPrefs: { bell: { ...kinds }, updatedAt: syncNow() } });
    },
  };
}
