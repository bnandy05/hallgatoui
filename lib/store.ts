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
  Subscription,
} from "@/lib/types";
import type { IcalEventDTO } from "@/lib/ical/types";
import { matchCourseInText } from "@/lib/ical/match";
import { cleanCanvasTitle, formatKindLabel } from "@/lib/ical/canvas";
import { DEFAULT_EXPORT_OPTIONS } from "@/lib/ical/export";
import { mergeFeedSync } from "@/lib/ical/sync";
import { keywordForContext, type DiscoveryDecision } from "@/lib/ical/discover";
import { pickCourseColor } from "@/lib/colors";
import { normalizeLinkUrl } from "@/lib/url";
import { buildDemoData } from "@/lib/demo";

/** Assigns unassigned iCal deadlines (of course-less feeds) by keyword and cleans their titles. */
function rematchDeadlines(deadlines: Deadline[], feeds: IcalFeed[], courses: Course[]): Deadline[] {
  const autoFeedIds = new Set(feeds.filter((f) => f.courseId === null).map((f) => f.id));
  return deadlines.map((d) => {
    if (d.source !== "ical" || d.courseId !== null || !d.feedId || !autoFeedIds.has(d.feedId)) {
      return d;
    }
    const courseId = matchCourseInText(d.title, courses);
    return courseId ? { ...d, courseId, title: cleanCanvasTitle(d.title) } : d;
  });
}

function emptyAppData(): AppData {
  return { version: 1, courses: [], deadlines: [], customPlatforms: [], feeds: [] };
}

const MAX_NOTIFIED_KEYS = 500;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: false,
  leadMinutes: [1440, 60],
  criticalOnly: false,
};

export interface AppStore extends AppData {
  // device preferences (persisted, but not part of AppData)
  notificationPrefs: NotificationPrefs;
  notifiedKeys: string[];
  setNotificationPrefs: (patch: Partial<NotificationPrefs>) => void;
  markNotified: (keys: string[]) => void;
  // calendar subscription (persisted, but not part of AppData: never exported/imported)
  subscription: Subscription | null;
  exportOptions: ExportOptions;
  setSubscription: (subscription: Subscription | null) => void;
  patchSubscription: (patch: Partial<Subscription>) => void;
  setExportOptions: (patch: Partial<ExportOptions>) => void;

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

  // deadlines
  addDeadline: (
    d: Omit<Deadline, "id" | "source" | "done"> & { done?: boolean }
  ) => string;
  updateDeadline: (id: string, patch: Partial<Omit<Deadline, "id">>) => void;
  removeDeadline: (id: string) => void;
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

  // data
  importData: (data: AppData) => void;
  resetAll: () => void;
  loadDemo: () => void;
}

export const useStore = create<AppStore>()(
  persist(
    (set) => ({
      ...emptyAppData(),
      notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      notifiedKeys: [],
      subscription: null,
      exportOptions: DEFAULT_EXPORT_OPTIONS,

      // ---- calendar subscription ----
      setSubscription: (subscription) => {
        set({ subscription });
      },
      patchSubscription: (patch) => {
        set((state) => (state.subscription ? { subscription: { ...state.subscription, ...patch } } : state));
      },
      setExportOptions: (patch) => {
        set((state) => ({ exportOptions: { ...state.exportOptions, ...patch } }));
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
        set((state) => ({ courses: [...state.courses, course] }));
        return id;
      },
      updateCourse: (id, patch) => {
        set((state) => ({
          courses: state.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }));
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
      updateDeadline: (id, patch) => {
        set((state) => ({
          deadlines: state.deadlines.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        }));
      },
      removeDeadline: (id) => {
        set((state) => ({ deadlines: state.deadlines.filter((d) => d.id !== id) }));
      },
      toggleDone: (id) => {
        set((state) => ({
          deadlines: state.deadlines.map((d) =>
            d.id === id ? { ...d, done: !d.done } : d
          ),
        }));
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

          return {
            deadlines,
            feeds: state.feeds.map((f) =>
              f.id === feedId
                ? {
                    ...f,
                    lastSyncedAt: now.toISOString(),
                    lastError: undefined,
                    discovered,
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

          for (const decision of decisions) {
            const { items } = decision;
            const keywords = [...new Set(items.map((i) => keywordForContext(i.context)))];
            const links: CourseLink[] = [];
            for (const { context } of items) {
              const url = context.courseUrl ? normalizeLinkUrl(context.courseUrl) : null;
              if (!url) continue;
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
            const keys = ignoredByFeed.get(f.id);
            if (!keys) return f;
            return { ...f, ignoredContexts: [...new Set([...(f.ignoredContexts ?? []), ...keys])] };
          });

          return { courses, feeds, deadlines: rematchDeadlines(state.deadlines, feeds, courses) };
        });
        return created;
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
    }),
    {
      name: "hallgatoireteg-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // persist merges shallowly, so options added in newer versions need their defaults here.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AppStore>;
        return {
          ...current,
          ...saved,
          exportOptions: { ...DEFAULT_EXPORT_OPTIONS, ...saved.exportOptions },
        };
      },
      partialize: (state) => ({
        version: state.version,
        courses: state.courses,
        deadlines: state.deadlines,
        customPlatforms: state.customPlatforms,
        feeds: state.feeds,
        notificationPrefs: state.notificationPrefs,
        notifiedKeys: state.notifiedKeys,
        subscription: state.subscription,
        exportOptions: state.exportOptions,
      }),
    }
  )
);
