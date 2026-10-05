import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_EXPORT_OPTIONS } from "@/lib/ical/export";
import { mergeAppData, stableStringify, type SyncPayload } from "@/lib/sync/merge";
import type { Deadline } from "@/lib/types";
import { emptyAppData, makeCourse, makeDeadline } from "./helpers";

function payload(deadlines: Deadline[] = [], extra: Partial<SyncPayload["data"]> = {}, exportOptions = DEFAULT_EXPORT_OPTIONS): SyncPayload {
  return { data: { ...emptyAppData(), deadlines, ...extra }, exportOptions };
}

const d = (id: string, title = id) => makeDeadline({ id, title });
const ids = (p: SyncPayload) => p.data.deadlines.map((x) => x.id);

test("stableStringify ignores key order", () => {
  assert.equal(stableStringify({ a: 1, b: { c: 2, d: [1, { y: 1, x: 2 }] } }), stableStringify({ b: { d: [1, { x: 2, y: 1 }], c: 2 }, a: 1 }));
  assert.notEqual(stableStringify({ a: 1 }), stableStringify({ a: 2 }));
});

test("adds on both sides: remote order, then local additions", () => {
  const base = payload([d("d1")]);
  const local = payload([d("d1"), d("A")]);
  const remote = payload([d("d1"), d("B")]);
  assert.deepEqual(ids(mergeAppData(base, local, remote)), ["d1", "B", "A"]);
});

test("edits to different items on both sides both survive", () => {
  const base = payload([d("d1"), d("d2")]);
  const local = payload([d("d1", "local"), d("d2")]);
  const remote = payload([d("d1"), d("d2", "remote")]);
  const merged = mergeAppData(base, local, remote);
  assert.deepEqual(merged.data.deadlines.map((x) => x.title), ["local", "remote"]);
});

test("edit of the same item on both sides: remote wins", () => {
  const base = payload([d("d1")]);
  const merged = mergeAppData(base, payload([d("d1", "local")]), payload([d("d1", "remote")]));
  assert.equal(merged.data.deadlines[0].title, "remote");
});

test("same id added on both sides: remote wins", () => {
  const merged = mergeAppData(payload(), payload([d("x", "local")]), payload([d("x", "remote")]));
  assert.deepEqual(merged.data.deadlines.map((x) => x.title), ["remote"]);
});

test("local delete of an item remote left alone removes it", () => {
  const base = payload([d("d1"), d("d2")]);
  assert.deepEqual(ids(mergeAppData(base, payload([d("d2")]), payload([d("d1"), d("d2")]))), ["d2"]);
});

test("local delete vs remote edit keeps the remote's item", () => {
  const base = payload([d("d1")]);
  const merged = mergeAppData(base, payload(), payload([d("d1", "remote")]));
  assert.equal(merged.data.deadlines[0].title, "remote");
});

test("remote delete of an item local left alone removes it", () => {
  const base = payload([d("d1"), d("d2")]);
  assert.deepEqual(ids(mergeAppData(base, payload([d("d1"), d("d2")]), payload([d("d1")]))), ["d1"]);
});

test("remote delete vs local edit: remote wins (deleted)", () => {
  const base = payload([d("d1")]);
  assert.deepEqual(ids(mergeAppData(base, payload([d("d1", "local")]), payload())), []);
});

test("other collections merge by id too", () => {
  const base = payload([], { courses: [makeCourse("c1", "A")] });
  const local = payload([], { courses: [makeCourse("c1", "A"), makeCourse("c2", "B")] });
  const remote = payload([], { courses: [makeCourse("c1", "A renamed")] });
  const merged = mergeAppData(base, local, remote);
  assert.deepEqual(merged.data.courses.map((c) => c.name), ["A renamed", "B"]);
});

test("ignored pairs merge as a set", () => {
  const base = payload([], { ignoredDuplicatePairs: ["p2", "p3"] });
  const local = payload([], { ignoredDuplicatePairs: ["p2", "p3", "p1"] });
  const remote = payload([], { ignoredDuplicatePairs: ["p3"] });
  const merged = mergeAppData(base, local, remote);
  assert.deepEqual(merged.data.ignoredDuplicatePairs, ["p3", "p1"]);
});

test("ignored pairs: local removal is applied to remote additions of others", () => {
  const base = payload([], { ignoredDuplicatePairs: ["p1"] });
  const local = payload([], { ignoredDuplicatePairs: [] });
  const remote = payload([], { ignoredDuplicatePairs: ["p1", "p9"] });
  assert.deepEqual(mergeAppData(base, local, remote).data.ignoredDuplicatePairs, ["p9"]);
});

test("export options changed only locally: local's value", () => {
  const base = payload();
  const local = payload([], {}, { ...DEFAULT_EXPORT_OPTIONS, alarms: !DEFAULT_EXPORT_OPTIONS.alarms });
  assert.equal(mergeAppData(base, local, payload()).exportOptions.alarms, !DEFAULT_EXPORT_OPTIONS.alarms);
});

test("export options changed on both sides: remote's value", () => {
  const flip = (v: boolean) => !v;
  const base = payload();
  const local = payload([], {}, { ...DEFAULT_EXPORT_OPTIONS, alarms: flip(DEFAULT_EXPORT_OPTIONS.alarms) });
  const remote = payload([], {}, { ...DEFAULT_EXPORT_OPTIONS, alarms: DEFAULT_EXPORT_OPTIONS.alarms, includeDone: flip(DEFAULT_EXPORT_OPTIONS.includeDone) });
  const merged = mergeAppData(base, local, remote);
  // Different options on different sides both survive; the same option: remote.
  assert.equal(merged.exportOptions.alarms, flip(DEFAULT_EXPORT_OPTIONS.alarms));
  assert.equal(merged.exportOptions.includeDone, flip(DEFAULT_EXPORT_OPTIONS.includeDone));
});
