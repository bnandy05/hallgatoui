import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAccountStore } from "@/lib/server/account/memoryStore";
import { DEFAULT_EXPORT_OPTIONS } from "@/lib/ical/export";
import { calendarInput } from "@/lib/server/calendarInput";
import { renderCalendar } from "@/lib/server/calendar";
import { saveData } from "@/lib/server/validate";
import type { DataDoc } from "@/lib/server/account/store";
import type { AppData, ClassSession } from "@/lib/types";
import { emptyAppData, makeCourse, makeDeadline, makeFeed } from "./helpers";

const NOW = new Date("2026-10-05T10:00:00.000Z");
const APP = "https://app.example.hu";

function doc(data: AppData, options = DEFAULT_EXPORT_OPTIONS): DataDoc {
  return { version: 1, updatedAt: NOW.toISOString(), data, exportOptions: options };
}

function session(i: number, sourceId = "t1"): ClassSession {
  return {
    id: `s${i}`, sourceId, externalUid: `u${i}`, subject: "Analízis", subjectKey: "analizis",
    start: "2026-10-06T08:00:00.000Z", end: "2026-10-06T09:40:00.000Z", kind: "ora", teachers: [], courseId: null,
  };
}

test("calendarInput strips course links and resources and carries the export options", () => {
  const data: AppData = {
    ...emptyAppData(),
    courses: [
      {
        ...makeCourse("c1", "Analízis"),
        links: [{ id: "l1", platformId: "teams", url: "https://teams.example.com/x" }],
        resources: [{ id: "r1", title: "J", url: "https://example.com/j.pdf", kind: "jegyzet" as const, createdAt: "2026-09-01T00:00:00.000Z" }],
      },
    ],
    feeds: [makeFeed({ id: "f1" })],
    ignoredDuplicatePairs: ["a|b"],
  };
  const input = calendarInput(doc(data, { ...DEFAULT_EXPORT_OPTIONS, dedupe: false }));
  assert.deepEqual(input.courses[0].links, []);
  assert.deepEqual(input.courses[0].resources, []);
  assert.equal(input.courses[0].name, "Analízis");
  assert.equal(input.options.dedupe, false);
  assert.deepEqual(input.ignoredDuplicatePairs, ["a|b"]);
  assert.equal(input.feeds[0].id, "f1");
});

test("calendarInput drops skipped timetable subjects and caps the sessions", () => {
  const sources = [
    { id: "t1", name: "Neptun", url: "", importedAt: "x", subjectCourses: { analizis: null } },
  ] as unknown as AppData["timetableSources"];
  const hidden = calendarInput(doc({ ...emptyAppData(), classSessions: [session(1)], timetableSources: sources }));
  assert.equal(hidden.classSessions.length, 0);

  const many = Array.from({ length: 1600 }, (_, i) => session(i, "t2"));
  const capped = calendarInput(doc({ ...emptyAppData(), classSessions: many }));
  assert.equal(capped.classSessions.length, 1500);
});

function setup() {
  const store = createMemoryAccountStore();
  const data = (title: string): AppData => ({
    ...emptyAppData(),
    courses: [makeCourse("c1", "Analízis")],
    deadlines: [makeDeadline({ id: "d1", courseId: "c1", title, due: "2026-10-08T21:59:00.000Z" })],
  });
  return { store, data };
}

test("renderCalendar: null without data; cached for a request, fresh after a save", async () => {
  const { store, data } = setup();
  assert.equal(await renderCalendar(store, "u1", NOW, APP), null);

  await saveData(store, "u1", 0, data("Első cím"), DEFAULT_EXPORT_OPTIONS, NOW);
  const first = await renderCalendar(store, "u1", NOW, APP);
  assert.ok(first?.includes("Első cím"));
  assert.deepEqual((await store.kv.smembers("icsk:u1")).length, 1);

  // Changed behind the cache's back (no saveData): the cached calendar is served.
  await store.casData("u1", 1, { updatedAt: NOW.toISOString(), data: data("Második cím"), exportOptions: DEFAULT_EXPORT_OPTIONS });
  const cached = await renderCalendar(store, "u1", NOW, APP);
  assert.ok(cached?.includes("Első cím"));

  // A real save drops the cache, so the next render shows the change at once.
  await saveData(store, "u1", 2, data("Harmadik cím"), DEFAULT_EXPORT_OPTIONS, NOW);
  const fresh = await renderCalendar(store, "u1", NOW, APP);
  assert.ok(fresh?.includes("Harmadik cím"));
  assert.ok(!fresh?.includes("Első cím"));
});

test("renderCalendar keeps one cache entry per view", async () => {
  const { store, data } = setup();
  await saveData(store, "u1", 0, data("Cím"), DEFAULT_EXPORT_OPTIONS, NOW);
  await renderCalendar(store, "u1", NOW, APP);
  await renderCalendar(store, "u1", NOW, APP, "kritikus");
  assert.equal((await store.kv.smembers("icsk:u1")).length, 2);
});
