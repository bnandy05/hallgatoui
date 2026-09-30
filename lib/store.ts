import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { newId } from "@/lib/id";
import type {
  AppData,
  Course,
  CourseLink,
  Deadline,
  IcalFeed,
  Platform,
  Resource,
} from "@/lib/types";
import type { IcalEventDTO } from "@/lib/ical/types";
import { matchCourse } from "@/lib/ical/match";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function emptyAppData(): AppData {
  return { version: 1, courses: [], deadlines: [], customPlatforms: [], feeds: [] };
}

export interface AppStore extends AppData {
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
  applyFeedSync: (feedId: string, events: IcalEventDTO[]) => void;

  // data
  importData: (data: AppData) => void;
  resetAll: () => void;
  loadDemo: () => void;
}

export const useStore = create<AppStore>()(
  persist(
    (set) => ({
      ...emptyAppData(),

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
      applyFeedSync: (feedId, events) => {
        set((state) => {
          const feed = state.feeds.find((f) => f.id === feedId);
          if (!feed) return state;

          const now = Date.now();
          const relevantEvents = events.filter(
            (e) => now - new Date(e.start).getTime() <= THIRTY_DAYS_MS
          );
          const incomingUids = new Set(relevantEvents.map((e) => e.uid));

          const existingByUid = new Map<string, Deadline>();
          for (const d of state.deadlines) {
            if (d.feedId === feedId && d.externalUid) {
              existingByUid.set(d.externalUid, d);
            }
          }

          // Keep every deadline that isn't part of this sync, plus this
          // feed's deadlines that are no longer present but whose due date
          // is already in the past (kept as history, never resurrected).
          const carried = state.deadlines.filter((d) => {
            if (d.feedId !== feedId) return true;
            const stillPresent = d.externalUid && incomingUids.has(d.externalUid);
            if (stillPresent) return false; // will be re-added below, updated
            const isFuture = new Date(d.due).getTime() >= now;
            return !isFuture; // drop future ones that vanished from the feed
          });

          const synced: Deadline[] = relevantEvents.map((event) => {
            const existing = existingByUid.get(event.uid);

            let courseId: string | null;
            if (feed.courseId) {
              courseId = feed.courseId;
            } else {
              const autoMatch = matchCourse(event, state.courses);
              courseId = existing ? (existing.courseId ?? autoMatch) : autoMatch;
            }

            if (existing) {
              return {
                ...existing,
                title: event.summary,
                due: event.start,
                url: event.url,
                courseId,
              };
            }

            return {
              id: newId(),
              courseId,
              title: event.summary,
              due: event.start,
              url: event.url,
              platformId: feed.platformId,
              critical: false,
              done: false,
              source: "ical",
              feedId,
              externalUid: event.uid,
            };
          });

          return {
            deadlines: [...carried, ...synced],
            feeds: state.feeds.map((f) =>
              f.id === feedId
                ? { ...f, lastSyncedAt: new Date().toISOString(), lastError: undefined }
                : f
            ),
          };
        });
      },

      // ---- data ----
      importData: (data) => {
        set(() => ({ ...data }));
      },
      resetAll: () => {
        set(() => emptyAppData());
      },
      loadDemo: () => {
        // Phase 6
      },
    }),
    {
      name: "hallgatoireteg-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        version: state.version,
        courses: state.courses,
        deadlines: state.deadlines,
        customPlatforms: state.customPlatforms,
        feeds: state.feeds,
      }),
    }
  )
);
