import type { AppStore, StoreSet } from "@/lib/store";
import { resultId, type RequirementResult, type RequirementRules } from "@/lib/rules/types";
import { normalizeSemesterStart } from "@/lib/timetable/semester";
import { syncNow } from "@/lib/sync/clock";

type RequirementActions = Pick<AppStore,
  "setRequirementRules" | "setRequirementResult" | "setRequirementResults" |
  "setComponentLink" | "applyAutoLinks" | "setSemester" | "markCatchUpPrompted" | "setBellAlertKinds"
>;

export function requirementActions(set: StoreSet): RequirementActions {
  return {
    setRequirementRules: (courseId, rules) => {
      set((state) => {
        const id = `rules:${courseId}`;
        const previous = state.requirementRules.find((r) => r.id === id);
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
          courseId,
          ...(kept.length > 0 && { calendarLinks: Object.fromEntries(kept) }),
          ...(decided.length > 0 && { autoLinked: decided }),
        };
        return { requirementRules: [...rest, next] };
      });
    },
    setRequirementResult: (courseId, componentId, instanceKey, patch) => {
      set((state) => {
        const id = resultId(courseId, componentId, instanceKey);
        const rest = state.requirementResults.filter((r) => r.id !== id);
        if (!patch) return { requirementResults: rest };
        const result: RequirementResult = { id, courseId, componentId, instanceKey, ...patch };
        if (result.state !== "recorded") delete result.value;
        return { requirementResults: [...rest, result] };
      });
    },
    setRequirementResults: (items) => {
      if (items.length === 0) return;
      set((state) => {
        const byId = new Map(state.requirementResults.map((r) => [r.id, r]));
        for (const { courseId, componentId, instanceKey, patch } of items) {
          const id = resultId(courseId, componentId, instanceKey);
          if (!patch) {
            byId.delete(id);
            continue;
          }
          const result: RequirementResult = { id, courseId, componentId, instanceKey, ...patch };
          if (result.state !== "recorded") delete result.value;
          byId.set(id, result);
        }
        return { requirementResults: [...byId.values()] };
      });
    },
    setComponentLink: (courseId, componentId, link) => {
      set((state) => {
        const rules = state.requirementRules.find((r) => r.courseId === courseId);
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
        const rules = state.requirementRules.find((r) => r.courseId === courseId);
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
