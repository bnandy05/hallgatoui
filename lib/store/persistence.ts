import { createJSONStorage, type PersistOptions } from "zustand/middleware";
import type { AppStore } from "@/lib/store";
import { DEFAULT_EXPORT_OPTIONS } from "@/lib/ical/export";
import { DEMO_CACHE_KEY, isDemoMode } from "@/lib/demoMode";
import { setServerOffset } from "@/lib/sync/clock";

const CACHE_KEY = "hallgatoireteg-v2";
const LEGACY_CACHE_KEY = "hallgatoireteg-v1";

/**
 * localStorage with a one-time hand-over of the pre-accounts cache: its data has no owner, so the
 * first sign-in on this browser can upload it into an empty account. The old key is removed so
 * data never lingers after sign-out.
 */
const cacheStorage = {
  getItem: (name: string) => {
    // The demo keeps its own copy in this tab only, so it never touches an account's cache.
    if (isDemoMode()) return sessionStorage.getItem(DEMO_CACHE_KEY);
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
  setItem: (name: string, value: string) =>
    isDemoMode() ? sessionStorage.setItem(DEMO_CACHE_KEY, value) : localStorage.setItem(name, value),
  removeItem: (name: string) => (isDemoMode() ? sessionStorage.removeItem(DEMO_CACHE_KEY) : localStorage.removeItem(name)),
};

export const storePersistence: PersistOptions<AppStore, Partial<AppStore>> = {
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
      pulledThisSession: false,
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
    semester: state.semester,
    catchUp: state.catchUp,
    alertPrefs: state.alertPrefs,
    semesterNumber: state.semesterNumber,
    semesterArchives: state.semesterArchives,
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
};
