import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAccountStore } from "@/lib/server/account/memoryStore";
import { DEFAULT_EXPORT_OPTIONS } from "@/lib/ical/export";
import { saveData, validateAppData, validateExportOptions } from "@/lib/server/validate";
import { MAX_REQUIREMENTS_CHARS } from "@/lib/importData";
import type { AppData } from "@/lib/types";
import { emptyAppData, makeCourse, makeDeadline, makeFeed } from "./helpers";

const NOW = new Date("2026-10-05T10:00:00.000Z");

function fullData(): AppData {
  return {
    ...emptyAppData(),
    courses: [
      {
        ...makeCourse("c1", "Analízis"),
        links: [{ id: "l1", platformId: "teams", url: "https://teams.example.com/x" }],
        resources: [{ id: "r1", title: "Jegyzet", url: "https://example.com/j.pdf", kind: "jegyzet" as const, createdAt: "2026-09-01T00:00:00.000Z" }],
      },
    ],
    deadlines: [makeDeadline({ courseId: "c1" })],
    feeds: [makeFeed()],
    ignoredDuplicatePairs: ["a|b"],
  };
}

test("validateAppData keeps a valid full document", () => {
  const data = validateAppData(fullData());
  assert.ok(data);
  assert.equal(data.courses[0].links.length, 1);
  assert.equal(data.courses[0].resources.length, 1);
  assert.equal(data.deadlines.length, 1);
  assert.equal(data.feeds.length, 1);
});

test("validateAppData keeps course requirements, caps them and drops non-text", () => {
  const data = fullData();
  data.courses[0] = { ...data.courses[0], requirements: "2 ZH, egyenként legalább 40%" };
  data.courses.push(
    { ...makeCourse("c2", "Prog"), requirements: "x".repeat(MAX_REQUIREMENTS_CHARS + 50) },
    // @ts-expect-error deliberately malformed
    { ...makeCourse("c3", "Matek"), requirements: { evil: true } },
    { ...makeCourse("c4", "Fizika"), requirements: "   " }
  );
  const valid = validateAppData(data);
  assert.ok(valid);
  assert.equal(valid.courses[0].requirements, "2 ZH, egyenként legalább 40%");
  assert.equal(valid.courses[1].requirements?.length, MAX_REQUIREMENTS_CHARS);
  assert.equal("requirements" in valid.courses[2], false);
  assert.equal("requirements" in valid.courses[3], false);
});

test("validateAppData rejects a deadline without due, and non-objects", () => {
  const bad = fullData();
  // @ts-expect-error deliberately malformed
  delete bad.deadlines[0].due;
  assert.equal(validateAppData(bad), null);
  assert.equal(validateAppData(null), null);
  assert.equal(validateAppData("x"), null);
  assert.equal(validateAppData({ ...fullData(), courses: [null] }), null);
});

test("validateAppData strips unsafe links and feeds", () => {
  const data = fullData();
  data.courses[0].links.push({ id: "l2", platformId: "teams", url: "javascript:alert(1)" });
  data.feeds.push(makeFeed({ id: "f2", url: "javascript:alert(1)" }));
  const valid = validateAppData(data)!;
  assert.deepEqual(valid.courses[0].links.map((l) => l.id), ["l1"]);
  assert.deepEqual(valid.feeds.map((f) => f.id), ["feed-1"]);
});

test("validateAppData applies the caps", () => {
  const tooManyFeeds = { ...fullData(), feeds: Array.from({ length: 21 }, (_, i) => makeFeed({ id: `f${i}` })) };
  assert.equal(validateAppData(tooManyFeeds), null);
  const session = (i: number) => ({
    id: `s${i}`, sourceId: "t", externalUid: `u${i}`, subject: "A", subjectKey: "a",
    start: "2026-10-06T08:00:00.000Z", end: "2026-10-06T09:40:00.000Z", kind: "ora", teachers: [], courseId: null,
  });
  const many = { ...emptyAppData(), classSessions: Array.from({ length: 1600 }, (_, i) => session(i)) };
  assert.equal(validateAppData(many)!.classSessions.length, 1500);
});

test("validateExportOptions fills defaults", () => {
  assert.deepEqual(validateExportOptions(undefined), DEFAULT_EXPORT_OPTIONS);
  assert.equal(validateExportOptions({ includeClasses: true }).includeClasses, true);
  assert.equal(validateExportOptions({ dedupe: false }).dedupe, false);
});

test("saveData: stale base conflicts and returns the stored doc", async () => {
  const store = createMemoryAccountStore();
  const first = await saveData(store, "u1", 0, fullData(), DEFAULT_EXPORT_OPTIONS, NOW);
  assert.deepEqual(first, { ok: true, version: 1 });
  const other = { ...emptyAppData(), deadlines: [makeDeadline({ id: "other" })] };
  const stale = await saveData(store, "u1", 0, other, DEFAULT_EXPORT_OPTIONS, NOW);
  assert.equal(stale.ok, false);
  if (!stale.ok) {
    assert.equal(stale.current?.version, 1);
    assert.equal(stale.current?.data.deadlines[0].id, "d1");
  }
  assert.deepEqual(await saveData(store, "u1", 1, other, DEFAULT_EXPORT_OPTIONS, NOW), { ok: true, version: 2 });
});

test("a successful save drops the user's rendered calendars, a failed one doesn't", async () => {
  const store = createMemoryAccountStore();
  await saveData(store, "u1", 0, fullData(), DEFAULT_EXPORT_OPTIONS, NOW);
  await store.kv.set("ics:u1:osszes", { ics: "BEGIN", renderedAt: NOW.toISOString() }, 900);
  await store.kv.sadd("icsk:u1", "ics:u1:osszes");

  await saveData(store, "u1", 0, fullData(), DEFAULT_EXPORT_OPTIONS, NOW); // conflict
  assert.ok(await store.kv.get("ics:u1:osszes"));

  await saveData(store, "u1", 1, fullData(), DEFAULT_EXPORT_OPTIONS, NOW);
  assert.equal(await store.kv.get("ics:u1:osszes"), null);
  assert.deepEqual(await store.kv.smembers("icsk:u1"), []);
});

test("validateAppData caps and filters the ignored duplicate pairs", () => {
  const pairs = Array.from({ length: 2500 }, (_, i) => `a${i}|b${i}`);
  const data = validateAppData({ ...emptyAppData(), ignoredDuplicatePairs: [...pairs, 42, null] })!;
  assert.equal(data.ignoredDuplicatePairs.length, 2000);
  assert.ok(data.ignoredDuplicatePairs.every((p) => typeof p === "string"));
});
