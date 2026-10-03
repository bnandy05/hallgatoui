import { buildCalendar } from "@/lib/ical/export";
import { useStore, type AppStore } from "@/lib/store";
import type { CalendarSnapshot, Subscription } from "@/lib/types";

const API = "/api/naptar";
const GENERIC_ERROR = "A naptár-előfizetés nem érhető el";

type SnapshotSource = Pick<
  AppStore,
  "courses" | "deadlines" | "feeds" | "customPlatforms" | "exportOptions"
>;

/**
 * What gets uploaded. Course links/resources and the feeds' discovery state are left out:
 * the calendar doesn't need them.
 */
export function buildSnapshot(state: SnapshotSource): CalendarSnapshot {
  return {
    courses: state.courses.map((c) => ({ ...c, links: [], resources: [] })),
    deadlines: state.deadlines,
    feeds: state.feeds.map((f) => ({
      id: f.id,
      name: f.name,
      url: f.url,
      platformId: f.platformId,
      courseId: f.courseId,
      ignoredContexts: f.ignoredContexts,
    })),
    customPlatforms: state.customPlatforms,
    options: state.exportOptions,
  };
}

/** Path part of the subscription URL; add an origin or a scheme in front of it. */
export function subscriptionPath(token: string): string {
  return `/api/naptar/${token}.ics`;
}

async function errorFrom(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: unknown };
    if (typeof json.error === "string") return json.error;
  } catch {
    // Not JSON: fall through.
  }
  return GENERIC_ERROR;
}

function networkError(): string {
  return "A szerver nem érhető el";
}

/** Creates a subscription from the current data. Returns an error message, or null on success. */
export async function createSubscription(): Promise<string | null> {
  const state = useStore.getState();
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot: buildSnapshot(state) }),
    });
    if (!res.ok) return await errorFrom(res);
    const json = (await res.json()) as Partial<Subscription>;
    if (typeof json.token !== "string" || typeof json.secret !== "string") return GENERIC_ERROR;
    lastPushedJson = JSON.stringify(buildSnapshot(state));
    state.setSubscription({
      token: json.token,
      secret: json.secret,
      lastPushedAt: new Date().toISOString(),
    });
    return null;
  } catch {
    return networkError();
  }
}

let lastPushedJson: string | null = null;
let pushing: Promise<void> | null = null;
let pushAgain = false;

async function pushOnce(): Promise<void> {
  const state = useStore.getState();
  const sub = state.subscription;
  if (!sub) return;
  const json = JSON.stringify(buildSnapshot(state));
  try {
    const res = await fetch(`${API}/${sub.token}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${sub.secret}` },
      body: `{"snapshot":${json}}`,
    });
    if (!res.ok) {
      const message =
        res.status === 404
          ? "Az előfizetés már nem létezik a szerveren. Kapcsold ki, majd be újra."
          : await errorFrom(res);
      state.patchSubscription({ lastError: message });
      return;
    }
    lastPushedJson = json;
    state.patchSubscription({ lastPushedAt: new Date().toISOString(), lastError: undefined });
  } catch {
    state.patchSubscription({ lastError: networkError() });
  }
}

/**
 * Uploads the current data. With `onlyIfChanged`, nothing is sent when the snapshot equals
 * the last one pushed from this tab. Overlapping calls are coalesced.
 */
export async function pushSnapshot(opts?: { onlyIfChanged?: boolean }): Promise<void> {
  const state = useStore.getState();
  if (!state.subscription) return;
  if (opts?.onlyIfChanged && JSON.stringify(buildSnapshot(state)) === lastPushedJson) return;

  if (pushing) {
    pushAgain = true;
    return pushing;
  }
  pushing = (async () => {
    do {
      pushAgain = false;
      await pushOnce();
    } while (pushAgain);
  })().finally(() => {
    pushing = null;
  });
  return pushing;
}

/** Deletes the subscription on the server and clears it locally. Returns an error message or null. */
export async function deleteSubscription(): Promise<string | null> {
  const state = useStore.getState();
  const sub = state.subscription;
  if (!sub) return null;
  try {
    const res = await fetch(`${API}/${sub.token}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${sub.secret}` },
    });
    // 404: already gone on the server, which is what we wanted.
    if (!res.ok && res.status !== 404) {
      const message = await errorFrom(res);
      state.patchSubscription({ lastError: message });
      return message;
    }
  } catch {
    const message = networkError();
    state.patchSubscription({ lastError: message });
    return message;
  }
  lastPushedJson = null;
  state.setSubscription(null);
  return null;
}

/** New token and secret: the old link stops working. Returns an error message or null. */
export async function rotateSubscription(): Promise<string | null> {
  const failure = await deleteSubscription();
  if (failure) return failure;
  return createSubscription();
}

/** One-time .ics download built in the browser; works without a subscription or server. */
export function downloadCalendar(): void {
  const { courses, deadlines, exportOptions } = useStore.getState();
  const ics = buildCalendar({
    courses,
    deadlines,
    options: exportOptions,
    now: new Date(),
    appUrl: window.location.origin,
  });
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "hallgatoi-reteg.ics";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
