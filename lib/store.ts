import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { newId } from "@/lib/id";
import type {
  AppData,
  Course,
  CourseLink,
  Deadline,
  ExportOptions,
  IcalFeed,
  NotificationPrefs,
  Platform,
  Resource,
  TimetableSource,
} from "@/lib/types";
import type { IcalEventDTO } from "@/lib/ical/types";
import { resultId, type RequirementResult, type RequirementRules, type SubjectRules } from "@/lib/rules/types";
import { formatKindLabel } from "@/lib/ical/canvas";
import { DEFAULT_EXPORT_OPTIONS } from "@/lib/ical/export";
import { mergeFeedSync, rematchDeadlines } from "@/lib/ical/sync";
import { CONFIRMED_PREFIX, confirmedPairKey, findDuplicates, pairKey } from "@/lib/ical/dedupe";
import {
  applySubjectMapping,
  mergeTimetableImport,
  type ParsedSession,
} from "@/lib/ical/neptun";
import { autoLinkContexts, keywordForContext, type DiscoveryDecision } from "@/lib/ical/discover";
import { pickCourseColor } from "@/lib/colors";
import { normalizeLinkUrl } from "@/lib/url";
import { buildDemoData } from "@/lib/demo";
import type { ThemePref } from "@/lib/theme";
import type { SyncPayload } from "@/lib/sync/merge";
import { setServerOffset, syncNow } from "@/lib/sync/clock";
import { stampChanges, type Stamped } from "@/lib/sync/stamp";

export function emptyAppData(): AppData {
  return { version: 1, courses: [], deadlines: [], customPlatforms: [], feeds: [], ignoredDuplicatePairs: [],
    classSessions: [],
    timetableSources: [],
    requirementRules: [],
    requirementResults: [],
    tombstones: {},
  };
}

/** Server or merged data from before a field existed gets that field's default. */
function withDataDefaults(data: AppData): AppData {
  return {
    ...data,
    classSessions: data.classSessions ?? [],
    timetableSources: data.timetableSources ?? [],
    requirementRules: data.requirementRules ?? [],
    requirementResults: data.requirementResults ?? [],
    tombstones: data.tombstones ?? {},
  };
}

const MAX_NOTIFIED_KEYS = 500;

const CACHE_KEY = "hallgatoireteg-v2";
const LEGACY_CACHE_KEY = "hallgatoireteg-v1";

export interface Account {
  userId: string;
  email: string;
}

export type SyncStatus = "idle" | "saving" | "offline" | "error";

/** Picks the synced part (AppData + export options) out of the store state. */
export function selectPayload(s: AppData & { exportOptions: ExportOptions }): SyncPayload {
  return {
    data: {
      version: s.version,
      courses: s.courses,
      deadlines: s.deadlines,
      customPlatforms: s.customPlatforms,
      feeds: s.feeds,
      ignoredDuplicatePairs: s.ignoredDuplicatePairs,
      classSessions: s.classSessions,
      timetableSources: s.timetableSources,
      requirementRules: s.requirementRules,
      requirementResults: s.requirementResults,
      tombstones: s.tombstones,
    },
    exportOptions: s.exportOptions,
  };
}

/**
 * localStorage with a one-time hand-over of the pre-accounts cache: its data has no owner, so the
 * first sign-in on this browser can upload it into an empty account. The old key is removed so
 * data never lingers after sign-out.
 */
const cacheStorage = {
  getItem: (name: string) => {
    let value = localStorage.getItem(name);
    if (value === null && name === CACHE_KEY) {
      const legacy = localStorage.getItem(LEGACY_CACHE_KEY);
      if (legacy !== null) {
        value = legacy;
        localStorage.setItem(name, legacy);
        localStorage.removeItem(LEGACY_CACHE_KEY);
      }
    }
    return value;
  },
  setItem: (name: string, value: string) => localStorage.setItem(name, value),
  removeItem: (name: string) => localStorage.removeItem(name),
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: false,
  leadMinutes: [1440, 60],
  criticalOnly: false,
};

/** What the user chose for one timetable subject in the mapping dialog. */
export type SubjectDecision =
  | { kind: "existing"; courseId: string }
  | { kind: "new"; name: string }
  | { kind: "skip" };

export interface AppStore extends AppData {
  // device preferences (persisted, but not part of AppData)
  notificationPrefs: NotificationPrefs;
  notifiedKeys: string[];
  setNotificationPrefs: (patch: Partial<NotificationPrefs>) => void;
  markNotified: (keys: string[]) => void;
  exportOptions: ExportOptions;
  setExportOptions: (patch: Partial<ExportOptions>) => void;
  // account and sync (persisted as a cache; the server is the source of truth)
  account: Account | null;
  /** Whose data the persisted AppData is; null for data from before accounts existed. */
  ownerUserId: string | null;
  syncedVersion: number;
  /** The last state known to be on the server, the base of the three-way merge. */
  syncBase: SyncPayload | null;
  syncStatus: SyncStatus;
  syncError?: string;
  /** Server clock minus this device's clock, learned from API responses (see lib/sync/clock.ts). */
  serverOffsetMs: number;
  setServerOffsetMs: (ms: number) => void;
  setAccount: (account: Account | null) => void;
  /** Replaces the data with the server's and records it as synced. Needs `account`. */
  applyServerData: (payload: SyncPayload, version: number) => void;
  /** Replaces the data with a merge result, leaving the sync base alone. */
  applyMerged: (payload: SyncPayload) => void;
  markSynced: (version: number, base: SyncPayload) => void;
  setSyncStatus: (status: SyncStatus, error?: string) => void;
  /** Sign-out and user change: drops this user's data and sync state, keeps device preferences. */
  clearAccountData: () => void;
  // home board: show the timetable (device preference, not part of AppData)
  showClasses: boolean;
  setShowClasses: (show: boolean) => void;
  // light / dark / follow the system (device preference, not part of AppData)
  theme: ThemePref;
  setTheme: (theme: ThemePref) => void;

  // courses
  addCourse: (
    input: Omit<Course, "id" | "createdAt" | "links" | "resources"> &
      Partial<Pick<Course, "links" | "resources">>
  ) => string;
  updateCourse: (id: string, patch: Partial<Omit<Course, "id">>) => void;
  deleteCourse: (id: string) => void;

  // links
  addLink: (courseId: string, link: Omit<CourseLink, "id">) => void;
  updateLink: (
    courseId: string,
    linkId: string,
    patch: Partial<Omit<CourseLink, "id">>
  ) => void;
  removeLink: (courseId: string, linkId: string) => void;
  moveLink: (courseId: string, linkId: string, dir: -1 | 1) => void;

  // resources
  addResource: (courseId: string, r: Omit<Resource, "id" | "createdAt">) => void;
  updateResource: (
    courseId: string,
    resourceId: string,
    patch: Partial<Omit<Resource, "id">>
  ) => void;
  removeResource: (courseId: string, resourceId: string) => void;

  // requirement rules and results
  /** Sets (or with null removes) a course's rule set. Its results stay, so a re-pick keeps them. */
  setRequirementRules: (
    courseId: string,
    rules: (SubjectRules & Pick<RequirementRules, "source" | "templateId">) | null
  ) => void;
  /** Records, updates or (with null) clears one result, keyed by component and instance. */
  setRequirementResult: (
    courseId: string,
    componentId: string,
    instanceKey: string,
    patch: Pick<RequirementResult, "state"> & Partial<Pick<RequirementResult, "value" | "retakeOf" | "at" | "label">> | null
  ) => void;

  // deadlines
  addDeadline: (d: NewDeadline) => string;
  /** Several manual deadlines in one change (one sync); more than one share a new `seriesId`. */
  addDeadlines: (items: NewDeadline[]) => string[];
  updateDeadline: (id: string, patch: Partial<Omit<Deadline, "id">>) => void;
  removeDeadline: (id: string) => void;
  removeDeadlines: (ids: string[]) => void;
  toggleDone: (id: string) => void;

  // platforms
  addCustomPlatform: (name: string, color: string) => string;
  updateCustomPlatform: (
    id: string,
    patch: Partial<Pick<Platform, "name" | "color">>
  ) => void;
  removeCustomPlatform: (id: string) => void;

  // feeds
  addFeed: (feed: Omit<IcalFeed, "id">) => string;
  updateFeed: (id: string, patch: Partial<Omit<IcalFeed, "id">>) => void;
  removeFeed: (id: string) => void;
  markFeedPastDone: (feedId: string) => number; // returns how many deadlines were marked
  applyFeedSync: (feedId: string, events: IcalEventDTO[]) => void;
  rematchFeedDeadlines: () => void;
  applyDiscovery: (decisions: DiscoveryDecision[]) => number; // returns created courses

  // timetable
  /** Creates (or, with sourceId, re-imports) a timetable source and maps its subjects. */
  importTimetable: (
    meta: { sourceId?: string; name: string; url?: string },
    parsed: ParsedSession[],
    decisions: Record<string, SubjectDecision>
  ) => string;
  /** Changes the subject -> course mapping of a source (and its sessions). */
  remapTimetable: (sourceId: string, decisions: Record<string, SubjectDecision>) => void;
  removeTimetableSource: (sourceId: string) => void;

  // duplicates
  ignoreDuplicate: (aId: string, bId: string) => void;
  clearIgnoredDuplicates: () => void;
  /** Records pairs Jev judged to be one item (see `borderlinePairs`); a user exception still wins. */
  confirmDuplicates: (pairs: [string, string][]) => void;

  // data
  importData: (data: AppData) => void;
  resetAll: () => void;
  loadDemo: () => void;
}

/**
 * Turns the dialog's decisions into courses and a subject -> course mapping: creates the new
 * courses and adds the subject name to the keywords of the courses it is mapped onto.
 */
function resolveDecisions(
  courses: Course[],
  decisions: Record<string, SubjectDecision>,
  subjectNames: Record<string, string>
): { courses: Course[]; mapping: Record<string, string | null> } {
  const mapping: Record<string, string | null> = {};
  let next = courses;
  let created = 0;
  for (const [key, decision] of Object.entries(decisions)) {
    const subject = subjectNames[key] ?? key;
    if (decision.kind === "skip") {
      mapping[key] = null;
    } else if (decision.kind === "existing") {
      mapping[key] = decision.courseId;
      next = next.map((c) => {
        if (c.id !== decision.courseId) return c;
        const known = c.matchKeywords.some((k) => k.trim().toLowerCase() === subject.toLowerCase());
        return known ? c : { ...c, matchKeywords: [...c.matchKeywords, subject] };
      });
    } else {
      const id = newId();
      mapping[key] = id;
      next = [
        ...next,
        {
          id,
          name: decision.name.trim() || subject,
          color: pickCourseColor(courses.length + created),
          links: [],
          resources: [],
          matchKeywords: [subject],
          createdAt: new Date().toISOString(),
        },
      ];
      created += 1;
    }
  }
  return { courses: next, mapping };
}

/**
 * Ids of the other copies when `id` is the primary of a duplicate group (and merging is on),
 * so done/critical on the primary applies to the whole group.
 */
function groupFollowerIds(state: AppData & { exportOptions: ExportOptions }, id: string): Set<string> {
  if (!state.exportOptions.dedupe) return new Set();
  const group = findDuplicates(
    state.deadlines,
    state.feeds,
    state.ignoredDuplicatePairs,
    state.courses
  ).find((g) => g.primary.id === id);
  return new Set(group?.others.map((d) => d.id));
}

type NewDeadline = Omit<Deadline, "id" | "source" | "done"> & { done?: boolean };

/**
 * Wraps zustand's `set` so every change to a synced list is stamped (`updatedAt`) and every removal
 * tombstoned, whatever action made it. Merge results and server data bypass it (`rawSet`).
 */
function trackChanges(rawSet: (fn: (state: AppStore) => Partial<AppStore> | AppStore) => void) {
  return ((partial: unknown, replace?: boolean) => {
    const fn = (state: AppStore) => {
      const patch = typeof partial === "function" ? (partial as (s: AppStore) => Partial<AppStore> | AppStore)(state) : (partial as Partial<AppStore>);
      if (!patch || patch === state) return patch as AppStore;
      return stampChanges(state as Stamped, patch as Partial<Stamped>, syncNow()) as Partial<AppStore>;
    };
    (rawSet as unknown as (f: typeof fn, r?: boolean) => void)(fn, replace);
  }) as unknown as (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore> | AppStore)) => void;
}

export const useStore = create<AppStore>()(
  persist(
    (rawSet) => {
      const set = trackChanges(rawSet as never);
      return ({
      ...emptyAppData(),
      notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      notifiedKeys: [],
      exportOptions: DEFAULT_EXPORT_OPTIONS,
      account: null,
      ownerUserId: null,
      syncedVersion: 0,
      syncBase: null,
      syncStatus: "idle",
      showClasses: true,
      theme: "system",
      serverOffsetMs: 0,

      // ---- account and sync ----
      setServerOffsetMs: (serverOffsetMs) => {
        set({ serverOffsetMs });
      },
      setAccount: (account) => {
        set({ account });
      },
      applyServerData: (payload, version) => {
        rawSet((state) => ({
          ...withDataDefaults(payload.data),
          exportOptions: payload.exportOptions,
          ownerUserId: state.account?.userId ?? null,
          syncedVersion: version,
          syncBase: payload,
          syncStatus: "idle",
          syncError: undefined,
        }));
      },
      applyMerged: (payload) => {
        rawSet({ ...withDataDefaults(payload.data), exportOptions: payload.exportOptions });
      },
      markSynced: (version, base) => {
        set((state) => ({
          syncedVersion: version,
          syncBase: base,
          ownerUserId: state.account?.userId ?? state.ownerUserId,
        }));
      },
      setSyncStatus: (syncStatus, syncError) => {
        set({ syncStatus, syncError });
      },
      clearAccountData: () => {
        rawSet({
          ...emptyAppData(),
          exportOptions: DEFAULT_EXPORT_OPTIONS,
          notifiedKeys: [],
          account: null,
          ownerUserId: null,
          syncedVersion: 0,
          syncBase: null,
          syncStatus: "idle",
          syncError: undefined,
        });
      },

      // ---- export options ----
      setExportOptions: (patch) => {
        set((state) => ({ exportOptions: { ...state.exportOptions, ...patch } }));
      },

      setShowClasses: (showClasses) => {
        set({ showClasses });
      },
      setTheme: (theme) => {
        set({ theme });
      },

      // ---- notifications ----
      setNotificationPrefs: (patch) => {
        set((state) => ({ notificationPrefs: { ...state.notificationPrefs, ...patch } }));
      },
      markNotified: (keys) => {
        set((state) => {
          const prefixes = state.deadlines.map((d) => `${d.id}:`);
          // Keys look like `${deadlineId}:${lead}:${due}`; drop those of deleted deadlines.
          const merged = [...new Set([...state.notifiedKeys, ...keys])].filter((k) =>
            prefixes.some((p) => k.startsWith(p))
          );
          return { notifiedKeys: merged.slice(-MAX_NOTIFIED_KEYS) };
        });
      },

      // ---- courses ----
      addCourse: (input) => {
        const id = newId();
        const course: Course = {
          ...input,
          id,
          createdAt: new Date().toISOString(),
          links: input.links ?? [],
          resources: input.resources ?? [],
        };
        set((state) => {
          const courses = [...state.courses, course];
          return { courses, deadlines: rematchDeadlines(state.deadlines, state.feeds, courses) };
        });
        return id;
      },
      updateCourse: (id, patch) => {
        set((state) => {
          const courses = state.courses.map((c) => (c.id === id ? { ...c, ...patch } : c));
          return { courses, deadlines: rematchDeadlines(state.deadlines, state.feeds, courses) };
        });
      },
      deleteCourse: (id) => {
        set((state) => ({
          courses: state.courses.filter((c) => c.id !== id),
          deadlines: state.deadlines
            .filter((d) => !(d.courseId === id && d.source === "manual"))
            .map((d) => (d.courseId === id ? { ...d, courseId: null } : d)),
          feeds: state.feeds.map((f) =>
            f.courseId === id ? { ...f, courseId: null } : f
          ),
          classSessions: state.classSessions.map((s) =>
            s.courseId === id ? { ...s, courseId: null } : s
          ),
          timetableSources: state.timetableSources.map((src) => ({
            ...src,
            subjectCourses: Object.fromEntries(
              Object.entries(src.subjectCourses).filter(([, courseId]) => courseId !== id)
            ),
          })),
          requirementRules: state.requirementRules.filter((r) => r.courseId !== id),
          requirementResults: state.requirementResults.filter((r) => r.courseId !== id),
        }));
      },

      // ---- links ----
      addLink: (courseId, link) => {
        set((state) => ({
          courses: state.courses.map((c) =>
            c.id === courseId
              ? { ...c, links: [...c.links, { ...link, id: newId() }] }
              : c
          ),
        }));
      },
      updateLink: (courseId, linkId, patch) => {
        set((state) => ({
          courses: state.courses.map((c) =>
            c.id === courseId
              ? {
                  ...c,
                  links: c.links.map((l) => (l.id === linkId ? { ...l, ...patch } : l)),
                }
              : c
          ),
        }));
      },
      removeLink: (courseId, linkId) => {
        set((state) => ({
          courses: state.courses.map((c) =>
            c.id === courseId
              ? { ...c, links: c.links.filter((l) => l.id !== linkId) }
              : c
          ),
        }));
      },
      moveLink: (courseId, linkId, dir) => {
        set((state) => ({
          courses: state.courses.map((c) => {
            if (c.id !== courseId) return c;
            const index = c.links.findIndex((l) => l.id === linkId);
            if (index === -1) return c;
            const newIndex = index + dir;
            if (newIndex < 0 || newIndex >= c.links.length) return c;
            const links = [...c.links];
            const [item] = links.splice(index, 1);
            links.splice(newIndex, 0, item);
            return { ...c, links };
          }),
        }));
      },

      // ---- resources ----
      addResource: (courseId, r) => {
        const resource: Resource = {
          ...r,
          id: newId(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          courses: state.courses.map((c) =>
            c.id === courseId ? { ...c, resources: [...c.resources, resource] } : c
          ),
        }));
      },
      updateResource: (courseId, resourceId, patch) => {
        set((state) => ({
          courses: state.courses.map((c) =>
            c.id === courseId
              ? {
                  ...c,
                  resources: c.resources.map((r) =>
                    r.id === resourceId ? { ...r, ...patch } : r
                  ),
                }
              : c
          ),
        }));
      },
      removeResource: (courseId, resourceId) => {
        set((state) => ({
          courses: state.courses.map((c) =>
            c.id === courseId
              ? { ...c, resources: c.resources.filter((r) => r.id !== resourceId) }
              : c
          ),
        }));
      },

      // ---- deadlines ----
      addDeadline: (d) => {
        const id = newId();
        const deadline: Deadline = { ...d, id, source: "manual", done: d.done ?? false };
        set((state) => ({ deadlines: [...state.deadlines, deadline] }));
        return id;
      },
      addDeadlines: (items) => {
        if (items.length === 0) return [];
        const seriesId = items.length > 1 ? newId() : undefined;
        const created: Deadline[] = items.map((d) => ({
          ...d,
          id: newId(),
          source: "manual",
          done: d.done ?? false,
          ...(seriesId && { seriesId }),
        }));
        set((state) => ({ deadlines: [...state.deadlines, ...created] }));
        return created.map((d) => d.id);
      },
      updateDeadline: (id, patch) => {
        set((state) => {
          const shared =
            "done" in patch || "critical" in patch
              ? { done: patch.done, critical: patch.critical }
              : null;
          const followers = shared ? groupFollowerIds(state, id) : new Set<string>();
          return {
            deadlines: state.deadlines.map((d) => {
              if (d.id === id) return { ...d, ...patch };
              if (!followers.has(d.id) || !shared) return d;
              return {
                ...d,
                ...(shared.done !== undefined && { done: shared.done }),
                ...(shared.critical !== undefined && { critical: shared.critical }),
              };
            }),
          };
        });
      },
      removeDeadline: (id) => {
        set((state) => ({ deadlines: state.deadlines.filter((d) => d.id !== id) }));
      },
      removeDeadlines: (ids) => {
        const drop = new Set(ids);
        set((state) => ({ deadlines: state.deadlines.filter((d) => !drop.has(d.id)) }));
      },
      toggleDone: (id) => {
        set((state) => {
          const target = state.deadlines.find((d) => d.id === id);
          if (!target) return state;
          const done = !target.done;
          const followers = groupFollowerIds(state, id);
          return {
            deadlines: state.deadlines.map((d) =>
              d.id === id || followers.has(d.id) ? { ...d, done } : d
            ),
          };
        });
      },

      // ---- platforms ----
      addCustomPlatform: (name, color) => {
        const id = `custom-${newId()}`;
        const platform: Platform = { id, name, color, builtIn: false };
        set((state) => ({ customPlatforms: [...state.customPlatforms, platform] }));
        return id;
      },
      updateCustomPlatform: (id, patch) => {
        set((state) => ({
          customPlatforms: state.customPlatforms.map((p) =>
            p.id === id ? { ...p, ...patch } : p
          ),
        }));
      },
      removeCustomPlatform: (id) => {
        set((state) => ({
          customPlatforms: state.customPlatforms.filter((p) => p.id !== id),
          courses: state.courses.map((c) => ({
            ...c,
            links: c.links.map((l) =>
              l.platformId === id ? { ...l, platformId: "egyeb" } : l
            ),
          })),
        }));
      },

      // ---- feeds ----
      addFeed: (feed) => {
        const id = newId();
        set((state) => ({ feeds: [...state.feeds, { ...feed, id }] }));
        return id;
      },
      updateFeed: (id, patch) => {
        set((state) => ({
          feeds: state.feeds.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        }));
      },
      removeFeed: (id) => {
        set((state) => ({
          feeds: state.feeds.filter((f) => f.id !== id),
          deadlines: state.deadlines.filter((d) => d.feedId !== id),
        }));
      },
      markFeedPastDone: (feedId) => {
        let marked = 0;
        const now = Date.now();
        set((state) => ({
          deadlines: state.deadlines.map((d) => {
            if (d.feedId !== feedId || d.done || new Date(d.due).getTime() >= now) return d;
            marked += 1;
            return { ...d, done: true };
          }),
        }));
        return marked;
      },
      applyFeedSync: (feedId, events) => {
        set((state) => {
          const feed = state.feeds.find((f) => f.id === feedId);
          if (!feed) return state;

          const now = new Date();
          const { deadlines, discovered } = mergeFeedSync({
            feed,
            events,
            deadlines: state.deadlines,
            courses: state.courses,
            now,
          });

          // Contexts that already belong to a course bring their Canvas course link along.
          const { courses, linked } = autoLinkContexts(state.courses, { ...feed, discovered });

          return {
            deadlines,
            courses,
            feeds: state.feeds.map((f) =>
              f.id === feedId
                ? {
                    ...f,
                    lastSyncedAt: now.toISOString(),
                    lastError: undefined,
                    discovered,
                    ...(linked.length > 0 && { linkedContexts: [...(f.linkedContexts ?? []), ...linked] }),
                  }
                : f
            ),
          };
        });
      },

      rematchFeedDeadlines: () => {
        set((state) => ({
          deadlines: rematchDeadlines(state.deadlines, state.feeds, state.courses),
        }));
      },

      applyDiscovery: (decisions) => {
        let created = 0;
        set((state) => {
          let courses = state.courses;
          const ignoredByFeed = new Map<string, string[]>();
          // Contexts whose link this adds, so a later sync won't add it again after a delete.
          const linkedByFeed = new Map<string, string[]>();

          for (const decision of decisions) {
            const { items } = decision;
            const keywords = [...new Set(items.map((i) => keywordForContext(i.context)))];
            const links: CourseLink[] = [];
            for (const { feedId, context } of items) {
              const url = context.courseUrl ? normalizeLinkUrl(context.courseUrl) : null;
              if (!url || decision.kind === "skip") continue;
              linkedByFeed.set(feedId, [...(linkedByFeed.get(feedId) ?? []), context.key]);
              links.push({
                id: newId(),
                platformId: "canvas",
                url,
                label: items.length > 1 && context.kind ? formatKindLabel(context.kind) : undefined,
              });
            }

            if (decision.kind === "new") {
              const codes = items.flatMap((i) => (i.context.code ? [i.context.code] : []));
              courses = [
                ...courses,
                {
                  id: newId(),
                  name: decision.name,
                  code: codes.length > 0 ? codes.join(", ") : undefined,
                  semester: items[0]?.context.semester,
                  color: pickCourseColor(state.courses.length + created),
                  links,
                  resources: [],
                  matchKeywords: keywords,
                  createdAt: new Date().toISOString(),
                },
              ];
              created += 1;
            } else if (decision.kind === "existing") {
              courses = courses.map((c) => {
                if (c.id !== decision.courseId) return c;
                const known = new Set(c.matchKeywords.map((k) => k.trim().toLowerCase()));
                const newKeywords = keywords.filter((k) => !known.has(k.trim().toLowerCase()));
                const knownUrls = new Set(c.links.map((l) => l.url));
                return {
                  ...c,
                  matchKeywords: [...c.matchKeywords, ...newKeywords],
                  links: [...c.links, ...links.filter((l) => !knownUrls.has(l.url))],
                };
              });
            } else {
              for (const { feedId, context } of items) {
                ignoredByFeed.set(feedId, [...(ignoredByFeed.get(feedId) ?? []), context.key]);
              }
            }
          }

          const feeds = state.feeds.map((f) => {
            const ignored = ignoredByFeed.get(f.id);
            const linked = linkedByFeed.get(f.id);
            if (!ignored && !linked) return f;
            return {
              ...f,
              ...(ignored && { ignoredContexts: [...new Set([...(f.ignoredContexts ?? []), ...ignored])] }),
              ...(linked && { linkedContexts: [...new Set([...(f.linkedContexts ?? []), ...linked])] }),
            };
          });

          return { courses, feeds, deadlines: rematchDeadlines(state.deadlines, feeds, courses) };
        });
        return created;
      },

      // ---- timetable ----
      importTimetable: (meta, parsed, decisions) => {
        const sourceId = meta.sourceId ?? newId();
        set((state) => {
          const subjectNames = Object.fromEntries(parsed.map((p) => [p.subjectKey, p.subject]));
          const { courses, mapping } = resolveDecisions(state.courses, decisions, subjectNames);
          const previous = state.timetableSources.find((s) => s.id === sourceId);
          const source: TimetableSource = {
            id: sourceId,
            name: meta.name,
            url: meta.url ?? previous?.url,
            importedAt: new Date().toISOString(),
            // A re-import reuses the earlier mapping; only new subjects were asked about.
            subjectCourses: { ...previous?.subjectCourses, ...mapping },
          };
          return {
            courses,
            // Canvas deadlines imported earlier may match the new courses' keywords now.
            deadlines: rematchDeadlines(state.deadlines, state.feeds, courses),
            timetableSources: previous
              ? state.timetableSources.map((s) => (s.id === sourceId ? source : s))
              : [...state.timetableSources, source],
            classSessions: mergeTimetableImport(source, parsed, state.classSessions),
          };
        });
        return sourceId;
      },
      remapTimetable: (sourceId, decisions) => {
        set((state) => {
          const previous = state.timetableSources.find((s) => s.id === sourceId);
          if (!previous) return state;
          const subjectNames: Record<string, string> = {};
          for (const s of state.classSessions) {
            if (s.sourceId === sourceId) subjectNames[s.subjectKey] = s.subject;
          }
          const { courses, mapping } = resolveDecisions(state.courses, decisions, subjectNames);
          const source = { ...previous, subjectCourses: { ...previous.subjectCourses, ...mapping } };
          return {
            courses,
            deadlines: rematchDeadlines(state.deadlines, state.feeds, courses),
            timetableSources: state.timetableSources.map((s) => (s.id === sourceId ? source : s)),
            classSessions: applySubjectMapping(source, state.classSessions),
          };
        });
      },
      removeTimetableSource: (sourceId) => {
        set((state) => ({
          timetableSources: state.timetableSources.filter((s) => s.id !== sourceId),
          classSessions: state.classSessions.filter((s) => s.sourceId !== sourceId),
        }));
      },

      // ---- duplicates ----
      ignoreDuplicate: (aId, bId) => {
        set((state) => {
          const a = state.deadlines.find((d) => d.id === aId);
          const b = state.deadlines.find((d) => d.id === bId);
          if (!a || !b) return state;
          const key = pairKey(a, b);
          if (state.ignoredDuplicatePairs.includes(key)) return state;
          return { ignoredDuplicatePairs: [...state.ignoredDuplicatePairs, key] };
        });
      },
      clearIgnoredDuplicates: () => {
        // Only the user's exceptions; Jev's confirmations stay, so they aren't asked again.
        set((state) => ({ ignoredDuplicatePairs: state.ignoredDuplicatePairs.filter((p) => p.startsWith(CONFIRMED_PREFIX)) }));
      },
      confirmDuplicates: (pairs) => {
        set((state) => {
          const have = new Set(state.ignoredDuplicatePairs);
          const added: string[] = [];
          for (const [aId, bId] of pairs) {
            const a = state.deadlines.find((d) => d.id === aId);
            const b = state.deadlines.find((d) => d.id === bId);
            if (!a || !b) continue;
            const key = confirmedPairKey(a, b);
            if (have.has(key) || have.has(pairKey(a, b))) continue;
            have.add(key);
            added.push(key);
          }
          return added.length ? { ignoredDuplicatePairs: [...state.ignoredDuplicatePairs, ...added] } : state;
        });
      },

      // ---- requirement rules and results ----
      setRequirementRules: (courseId, rules) => {
        set((state) => {
          const id = `rules:${courseId}`;
          const rest = state.requirementRules.filter((r) => r.id !== id);
          if (!rules) return { requirementRules: rest };
          const { updatedAt: _u, ...clean } = rules as RequirementRules;
          void _u;
          const next: RequirementRules = { ...clean, id, courseId };
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

      // ---- data ----
      importData: (data) => {
        set(() => ({ ...data }));
      },
      resetAll: () => {
        set(() => ({ ...emptyAppData(), notifiedKeys: [] }));
      },
      loadDemo: () => {
        const demo = buildDemoData(new Date());
        set((state) => ({
          courses: [
            ...state.courses,
            ...demo.courses.filter((c) => !state.courses.some((existing) => existing.id === c.id)),
          ],
          deadlines: [
            ...state.deadlines,
            ...demo.deadlines.filter(
              (d) => !state.deadlines.some((existing) => existing.id === d.id)
            ),
          ],
          customPlatforms: [
            ...state.customPlatforms,
            ...demo.customPlatforms.filter(
              (p) => !state.customPlatforms.some((existing) => existing.id === p.id)
            ),
          ],
        }));
      },
      });
    },
    {
      name: CACHE_KEY,
      version: 1,
      storage: createJSONStorage(() => cacheStorage),
      // persist merges shallowly, so options added in newer versions need their defaults here.
      merge: (persisted, current) => {
        // `subscription` belonged to the pre-accounts calendar (local credentials); drop it.
        const { subscription: _legacy, ...saved } = (persisted ?? {}) as Partial<AppStore> & { subscription?: unknown };
        void _legacy;
        return {
          ...current,
          ...saved,
          exportOptions: { ...DEFAULT_EXPORT_OPTIONS, ...saved.exportOptions },
          ignoredDuplicatePairs: saved.ignoredDuplicatePairs ?? [],
          classSessions: saved.classSessions ?? [],
          timetableSources: saved.timetableSources ?? [],
          requirementRules: saved.requirementRules ?? [],
          requirementResults: saved.requirementResults ?? [],
          showClasses: saved.showClasses ?? true,
          theme: saved.theme ?? "system",
          account: saved.account ?? null,
          ownerUserId: saved.ownerUserId ?? null,
          syncedVersion: saved.syncedVersion ?? 0,
          syncBase: saved.syncBase ?? null,
          tombstones: saved.tombstones ?? {},
          serverOffsetMs: saved.serverOffsetMs ?? 0,
        };
      },
      // The clock module cannot import the store, so it gets the persisted offset here.
      onRehydrateStorage: () => (state) => setServerOffset(state?.serverOffsetMs ?? 0),
      partialize: (state) => ({
        version: state.version,
        courses: state.courses,
        deadlines: state.deadlines,
        customPlatforms: state.customPlatforms,
        feeds: state.feeds,
        ignoredDuplicatePairs: state.ignoredDuplicatePairs,
        classSessions: state.classSessions,
        timetableSources: state.timetableSources,
        requirementRules: state.requirementRules,
        requirementResults: state.requirementResults,
        tombstones: state.tombstones,
        serverOffsetMs: state.serverOffsetMs,
        showClasses: state.showClasses,
        theme: state.theme,
        notificationPrefs: state.notificationPrefs,
        notifiedKeys: state.notifiedKeys,
        exportOptions: state.exportOptions,
        account: state.account,
        ownerUserId: state.ownerUserId,
        syncedVersion: state.syncedVersion,
        syncBase: state.syncBase,
      }),
    }
  )
);
