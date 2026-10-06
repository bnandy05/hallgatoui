import { DEFAULT_EXPORT_OPTIONS } from "@/lib/ical/export";
import { hardNavigate } from "@/lib/account/path";
import { fetchMe, pullData, pushData } from "@/lib/account/client";
import { emptyAppData, selectPayload, useStore } from "@/lib/store";
import { mergeAppData, stableStringify, type SyncPayload } from "@/lib/sync/merge";
import { hasAppData, resolveStartupData } from "@/lib/sync/startup";

// The sync engine: keeps the zustand store and the server's data document in step. The server is
// the source of truth; localStorage is only a cache. Client only (imports the store).

const DEBOUNCE_MS = 1000;
const BACKOFF_MS = [2000, 5000, 15_000, 60_000];
const PULL_INTERVAL_MS = 5 * 60 * 1000;
const MAX_ROUNDS = 4;

const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);
const EMPTY: SyncPayload = { data: emptyAppData(), exportOptions: DEFAULT_EXPORT_OPTIONS };

let flushActive: (() => Promise<void>) | null = null;

/** Saves pending changes now (best effort). Used before signing out. */
export async function flushSync(): Promise<void> {
  await flushActive?.();
}

function redirectToLogin() {
  const here = window.location.pathname + window.location.search;
  hardNavigate(`/belepes?vissza=${encodeURIComponent(here)}`);
}

/** Starts syncing for the signed-in user; returns the function that stops it. */
export function startSync(): () => void {
  const store = useStore;
  let stopped = false;
  let started = false;
  let starting = false;
  let inFlight = false;
  let again = false;
  let retries = 0;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let redirecting = false;

  const ready = () => {
    const s = store.getState();
    return !!s.account && !!s.syncBase && s.ownerUserId === s.account.userId;
  };
  const dirty = () => {
    const s = store.getState();
    return ready() && !same(selectPayload(s), s.syncBase);
  };
  const busy = () => inFlight || debounce !== undefined;

  function unauthorized() {
    if (redirecting) return;
    redirecting = true;
    redirectToLogin();
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    const delay = BACKOFF_MS[Math.min(retries, BACKOFF_MS.length - 1)];
    retries += 1;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void (started ? flush() : start());
    }, delay);
  }

  /** Applies a newer remote state on top of the local edits. `base` is what the edits started from. */
  function mergeRemote(version: number, remote: SyncPayload, base: SyncPayload) {
    const s = store.getState();
    const merged = mergeAppData(base, selectPayload(s), remote);
    s.applyMerged(merged);
    s.markSynced(version, remote);
  }

  async function flush(): Promise<void> {
    if (stopped || !started) return;
    if (inFlight) {
      again = true;
      return;
    }
    inFlight = true;
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (!ready()) return;
        const s = store.getState();
        const base = s.syncBase as SyncPayload;
        const payload = selectPayload(s);
        if (same(payload, base)) {
          retries = 0;
          if (s.syncStatus !== "idle") s.setSyncStatus("idle");
          return;
        }
        s.setSyncStatus("saving");
        const userId = s.account?.userId;
        const result = await pushData(s.syncedVersion, payload);
        // Signed out or switched user while the request was out: drop the result.
        if (stopped || store.getState().account?.userId !== userId) return;

        if (result.kind === "ok") {
          store.getState().markSynced(result.version, payload);
          retries = 0;
        } else if (result.kind === "conflict") {
          mergeRemote(result.version, result.payload, base);
        } else if (result.kind === "unauthorized") {
          return unauthorized();
        } else {
          store.getState().setSyncStatus(result.offline ? "offline" : "error", result.error);
          if (result.retry) scheduleRetry();
          return;
        }
      }
      store.getState().setSyncStatus("error", "Nem sikerült menteni, újra próbáljuk");
      scheduleRetry();
    } finally {
      inFlight = false;
      if (again) {
        again = false;
        schedule();
      }
    }
  }

  function schedule() {
    if (stopped || !ready()) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = undefined;
      void flush();
    }, DEBOUNCE_MS);
  }

  async function pull(): Promise<void> {
    if (!started || busy() || retryTimer !== undefined || !ready() || dirty()) return;
    const s = store.getState();
    const userId = s.account?.userId;
    const result = await pullData(s.syncedVersion);
    if (stopped || store.getState().account?.userId !== userId) return;
    if (result.kind === "unauthorized") return unauthorized();
    if (result.kind !== "data") return;
    // Edits made while the request was out win the race: they merge on their next save.
    if (busy() || dirty()) return;
    store.getState().applyServerData(result.payload, result.version);
  }

  async function start(): Promise<void> {
    if (stopped || starting || started) return;
    starting = true;
    try {
      const me = await fetchMe();
      if (stopped) return;
      if (!me.ok) {
        if (me.status === 401) return unauthorized();
        store.getState().setSyncStatus("offline", me.error);
        scheduleRetry();
        return;
      }
      // A cache that belongs to someone else is dropped before anything can use it.
      if (store.getState().ownerUserId && store.getState().ownerUserId !== me.user.id) {
        store.getState().clearAccountData();
      }
      store.getState().setAccount({ userId: me.user.id, email: me.user.email });

      const pulled = await pullData();
      if (stopped) return;
      if (pulled.kind === "unauthorized") return unauthorized();
      if (pulled.kind !== "data") {
        store.getState().setSyncStatus(pulled.kind === "failed" && !pulled.offline ? "error" : "offline", pulled.kind === "failed" ? pulled.error : undefined);
        scheduleRetry();
        return;
      }

      const s = store.getState();
      if (s.ownerUserId === me.user.id && s.syncBase) {
        // Our own cache with a sync base: resume. Unsynced edits are merged, never overwritten.
        if (pulled.version !== s.syncedVersion) {
          if (dirty()) mergeRemote(pulled.version, pulled.payload, s.syncBase);
          else s.applyServerData(pulled.payload, pulled.version);
        }
      } else {
        const decision = resolveStartupData({
          userId: me.user.id,
          cacheOwner: s.ownerUserId,
          cacheHasData: hasAppData(selectPayload(s).data),
          serverVersion: pulled.version,
        });
        if (decision.kind === "use-server") {
          s.applyServerData(pulled.payload, pulled.version);
        } else {
          // Brand-new account and a cache of ours (or from before accounts): upload it once.
          const payload = selectPayload(s);
          const pushed = await pushData(0, payload);
          if (stopped) return;
          if (pushed.kind === "ok") {
            store.getState().markSynced(pushed.version, payload);
          } else if (pushed.kind === "conflict") {
            // Another device uploaded first: keep both.
            mergeRemote(pushed.version, pushed.payload, EMPTY);
          } else if (pushed.kind === "unauthorized") {
            return unauthorized();
          } else {
            store.getState().setSyncStatus(pushed.offline ? "offline" : "error", pushed.error);
            scheduleRetry();
            return;
          }
        }
      }

      started = true;
      retries = 0;
      store.getState().setSyncStatus("idle");
      store.getState().setPulledThisSession(true);
      if (dirty()) schedule();
    } finally {
      starting = false;
    }
  }

  // Store changes to the synced slices start the debounce.
  const unsubscribe = store.subscribe((state, prev) => {
    if (!started) return;
    const changed =
      state.courses !== prev.courses ||
      state.deadlines !== prev.deadlines ||
      state.customPlatforms !== prev.customPlatforms ||
      state.feeds !== prev.feeds ||
      state.classSessions !== prev.classSessions ||
      state.timetableSources !== prev.timetableSources ||
      state.requirementRules !== prev.requirementRules ||
      state.requirementResults !== prev.requirementResults ||
      state.semester !== prev.semester ||
      state.catchUp !== prev.catchUp ||
      state.ignoredDuplicatePairs !== prev.ignoredDuplicatePairs ||
      state.exportOptions !== prev.exportOptions;
    if (changed) schedule();
  });

  const onOnline = () => {
    clearTimeout(retryTimer);
    retryTimer = undefined;
    if (!started) void start();
    else if (dirty()) void flush();
    else void pull();
  };
  // A page opened offline (or frozen by the phone) may never see "online": try again when it is used.
  const resume = () => {
    if (started) return void pull();
    clearTimeout(retryTimer);
    retryTimer = undefined;
    void start();
  };
  // Leaving the page: upload now instead of waiting for the debounce (the cache keeps the edits anyway).
  const pushNow = () => {
    if (!started || !dirty()) return;
    clearTimeout(debounce);
    debounce = undefined;
    void flush();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") resume();
    else pushNow();
  };
  const onFocus = () => resume();
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pagehide", pushNow);
  document.addEventListener("visibilitychange", onVisible);
  const interval = setInterval(() => {
    if (document.visibilityState === "visible") void pull();
  }, PULL_INTERVAL_MS);

  flushActive = async () => {
    clearTimeout(debounce);
    debounce = undefined;
    // Let a save that is already out finish (up to ~3 s), then send whatever is left.
    for (let i = 0; i < 60 && inFlight; i++) await new Promise((r) => setTimeout(r, 50));
    await flush();
  };
  void start();

  return () => {
    stopped = true;
    unsubscribe();
    clearTimeout(debounce);
    clearTimeout(retryTimer);
    clearInterval(interval);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("pagehide", pushNow);
    document.removeEventListener("visibilitychange", onVisible);
    flushActive = null;
  };
}
