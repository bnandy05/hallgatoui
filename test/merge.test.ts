import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_EXPORT_OPTIONS } from "@/lib/ical/export";
import { collapseFeedDuplicates, mergeAppData, stableStringify, type SyncPayload } from "@/lib/sync/merge";
import { pruneTombstones } from "@/lib/sync/tombstones";
import { stampChanges } from "@/lib/sync/stamp";
import { offsetFromResponse } from "@/lib/sync/clock";
import type { Deadline } from "@/lib/types";
import { emptyAppData, makeCourse, makeDeadline } from "./helpers";

function payload(deadlines: Deadline[] = [], extra: Partial<SyncPayload["data"]> = {}, exportOptions = DEFAULT_EXPORT_OPTIONS): SyncPayload {
  return { data: { ...emptyAppData(), deadlines, ...extra }, exportOptions };
}

const d = (id: string, title = id) => makeDeadline({ id, title });
const T0 = "2026-10-05T10:00:00.000Z";
const T1 = "2026-10-05T11:00:00.000Z";
const T2 = "2026-10-05T12:00:00.000Z";
const NOW = "2026-10-06T00:00:00.000Z";
/** A deadline with an edit time. */
const u = (id: string, updatedAt: string, extra: Partial<Deadline> = {}) => makeDeadline({ id, title: id, updatedAt, ...extra });
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

test("edit of the same item on both sides without timestamps: remote wins", () => {
  const base = payload([d("d1")]);
  const merged = mergeAppData(base, payload([d("d1", "local")]), payload([d("d1", "remote")]));
  assert.equal(merged.data.deadlines[0].title, "remote");
});

test("same id added on both sides without timestamps: remote wins", () => {
  const merged = mergeAppData(payload(), payload([d("x", "local")]), payload([d("x", "remote")]));
  assert.deepEqual(merged.data.deadlines.map((x) => x.title), ["remote"]);
});

test("local delete of an item remote left alone removes it", () => {
  const base = payload([d("d1"), d("d2")]);
  assert.deepEqual(ids(mergeAppData(base, payload([d("d2")]), payload([d("d1"), d("d2")]))), ["d2"]);
});

test("local delete vs later remote edit keeps the remote's item", () => {
  const base = payload([d("d1")]);
  const local = payload([], { tombstones: { d1: T1 } });
  const merged = mergeAppData(base, local, payload([u("d1", T2, { title: "remote" })]), NOW);
  assert.equal(merged.data.deadlines[0].title, "remote");
  assert.deepEqual(merged.data.tombstones, {}); // it is back, so no longer deleted
});

test("remote delete of an item local left alone removes it", () => {
  const base = payload([d("d1"), d("d2")]);
  assert.deepEqual(ids(mergeAppData(base, payload([d("d1"), d("d2")]), payload([d("d1")]))), ["d1"]);
});

test("remote delete vs later local edit: the edit wins", () => {
  const base = payload([d("d1")]);
  const remote = payload([], { tombstones: { d1: T1 } });
  const merged = mergeAppData(base, payload([u("d1", T2, { title: "local" })]), remote, NOW);
  assert.deepEqual(merged.data.deadlines.map((x) => x.title), ["local"]);
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

test("different fields of one deadline changed on two devices: both kept", () => {
  const base = payload([u("d1", T0)]);
  const local = payload([u("d1", T1, { done: true })]);
  const remote = payload([u("d1", T2, { title: "renamed" })]);
  const item = mergeAppData(base, local, remote, NOW).data.deadlines[0];
  assert.equal(item.done, true);
  assert.equal(item.title, "renamed");
  assert.equal(item.updatedAt, T2);
});

test("same field: the later edit wins whichever side is local", () => {
  const base = payload([u("d1", T0)]);
  const early = payload([u("d1", T1, { title: "early" })]);
  const late = payload([u("d1", T2, { title: "late" })]);
  assert.equal(mergeAppData(base, early, late, NOW).data.deadlines[0].title, "late");
  assert.equal(mergeAppData(base, late, early, NOW).data.deadlines[0].title, "late");
});

test("same field, same time: the remote wins", () => {
  const base = payload([u("d1", T0)]);
  const merged = mergeAppData(base, payload([u("d1", T1, { title: "L" })]), payload([u("d1", T1, { title: "R" })]), NOW);
  assert.equal(merged.data.deadlines[0].title, "R");
});

test("offline delete later than a remote edit wins", () => {
  const base = payload([u("d1", T0)]);
  const local = payload([], { tombstones: { d1: T2 } });
  const remote = payload([u("d1", T1, { title: "edited" })]);
  const merged = mergeAppData(base, local, remote, NOW);
  assert.deepEqual(ids(merged), []);
  assert.equal(merged.data.tombstones?.d1, T2);
});

test("remote delete later than a local edit wins", () => {
  const base = payload([u("d1", T0)]);
  const remote = payload([], { tombstones: { d1: T2 } });
  assert.deepEqual(ids(mergeAppData(base, payload([u("d1", T1, { title: "x" })]), remote, NOW)), []);
});

test("a local-only add is kept, unless deleted elsewhere after it", () => {
  const base = payload();
  const added = payload([u("n", T1)]);
  assert.deepEqual(ids(mergeAppData(base, added, payload(), NOW)), ["n"]);
  assert.deepEqual(ids(mergeAppData(base, added, payload([], { tombstones: { n: T2 } }), NOW)), []);
});

test("same id added on both sides: per field, the newer side", () => {
  const merged = mergeAppData(payload(), payload([u("x", T1, { title: "L", note: "n", critical: true })]), payload([u("x", T2, { title: "R" })]), NOW);
  assert.equal(merged.data.deadlines[0].title, "R");
  assert.equal(merged.data.deadlines[0].critical, false); // no base: the newer side's value
});

test("a link edit on one device and a course rename on the other both survive", () => {
  const link = { id: "l1", platformId: "canvas", url: "https://a.example" };
  const course = (name: string, url: string, at: string) => ({ ...makeCourse("c1", name), updatedAt: at, links: [{ ...link, url, updatedAt: at }] });
  const base = payload([], { courses: [course("A", link.url, T0)] });
  const local = payload([], { courses: [course("A", "https://b.example", T1)] });
  const remote = payload([], { courses: [course("A renamed", link.url, T2)] });
  const merged = mergeAppData(base, local, remote, NOW).data.courses[0];
  assert.equal(merged.name, "A renamed");
  assert.equal(merged.links[0].url, "https://b.example");
});

test("a link added on one device and removed course links on the other", () => {
  const l1 = { id: "l1", platformId: "canvas", url: "https://a.example", updatedAt: T0 };
  const l2 = { id: "l2", platformId: "canvas", url: "https://b.example", updatedAt: T1 };
  const c = (links: typeof l1[]) => ({ ...makeCourse("c1", "A"), links });
  const base = payload([], { courses: [c([l1])] });
  const local = payload([], { courses: [c([l1, l2])] });
  const remote = payload([], { courses: [c([])], tombstones: { l1: T2 } });
  assert.deepEqual(mergeAppData(base, local, remote, NOW).data.courses[0].links.map((l) => l.id), ["l2"]);
});

test("the same feed event under two ids collapses; the later done wins, the remote id stays", () => {
  const ev = { feedId: "f1", externalUid: "e1", source: "ical" as const };
  const base = payload();
  const local = payload([u("local-id", T2, { ...ev, done: true })]);
  const remote = payload([u("remote-id", T1, { ...ev, done: false })]);
  const merged = mergeAppData(base, local, remote, NOW);
  assert.deepEqual(ids(merged), ["remote-id"]);
  assert.equal(merged.data.deadlines[0].done, true);
  assert.equal(merged.data.tombstones?.["local-id"], NOW);
});

test("collapseFeedDuplicates leaves other deadlines alone", () => {
  const a = u("a", T0, { feedId: "f", externalUid: "1" });
  const b = u("b", T0, { feedId: "f", externalUid: "2" });
  const manual = u("m", T0);
  const result = collapseFeedDuplicates([a, b, manual], new Set(["a"]));
  assert.deepEqual(result.dropped, []);
  assert.equal(result.deadlines.length, 3);
});

test("legacy items without updatedAt are the oldest", () => {
  const base = payload([d("d1")]);
  const merged = mergeAppData(base, payload([d("d1", "legacy")]), payload([u("d1", T1, { title: "stamped" })]), NOW);
  assert.equal(merged.data.deadlines[0].title, "stamped");
  // A tombstone beats an unstamped edit.
  const gone = mergeAppData(base, payload([], { tombstones: { d1: T0 } }), payload([d("d1", "edit")]), NOW);
  assert.deepEqual(ids(gone), []);
});

test("pruneTombstones drops old entries and caps the count", () => {
  const old = "2026-07-01T00:00:00.000Z";
  assert.deepEqual(pruneTombstones({ a: old, b: T2 }, NOW), { b: T2 });
  const many = Object.fromEntries(Array.from({ length: 5100 }, (_, i) => [`id${i}`, new Date(Date.parse(T0) + i * 1000).toISOString()]));
  const pruned = pruneTombstones(many, NOW);
  assert.equal(Object.keys(pruned).length, 5000);
  assert.ok("id5099" in pruned && !("id0" in pruned));
});

test("stampChanges stamps only changed items and tombstones removals", () => {
  const prev = { ...emptyAppData(), deadlines: [u("a", T0), u("b", T0), u("c", T0)] };
  const next = { deadlines: [prev.deadlines[0], { ...prev.deadlines[1], title: "new" }, makeDeadline({ id: "n" })] };
  const out = stampChanges(prev as never, next, T2);
  const byId = Object.fromEntries(out.deadlines.map((x) => [x.id, x.updatedAt]));
  assert.deepEqual(byId, { a: T0, b: T2, n: T2 });
  assert.deepEqual(out.tombstones, { c: T2 });
  // Rebuilt but equal: untouched.
  const same = stampChanges(prev as never, { deadlines: prev.deadlines.map((x) => ({ ...x })) }, T2);
  assert.deepEqual(same.deadlines.map((x) => x.updatedAt), [T0, T0, T0]);
});

test("stampChanges stamps a course and its link on a link edit", () => {
  const link = { id: "l1", platformId: "canvas", url: "https://a.example", updatedAt: T0 };
  const course = { ...makeCourse("c1", "A"), updatedAt: T0, links: [link] };
  const prev = { ...emptyAppData(), courses: [course] };
  const out = stampChanges(prev as never, { courses: [{ ...course, links: [{ ...link, url: "https://b.example" }] }] }, T2);
  assert.equal(out.courses[0].updatedAt, T2);
  assert.equal(out.courses[0].links[0].updatedAt, T2);
  const removed = stampChanges(prev as never, { courses: [{ ...course, links: [] }] }, T2);
  assert.equal(removed.tombstones?.l1, T2);
});

test("offsetFromResponse", () => {
  const sent = Date.parse("2026-10-05T12:00:00.000Z");
  assert.equal(offsetFromResponse(null, sent, sent + 100), null);
  assert.equal(offsetFromResponse("garbage", sent, sent + 100), null);
  // Server header 12:00:10 (truncated), request took 200 ms: the server is about 10.4 s ahead.
  assert.equal(offsetFromResponse("Mon, 05 Oct 2026 12:00:10 GMT", sent, sent + 200), 10_400);
});

test("a rule set merges as one block: both sides edited, the later edit wins whole", () => {
  const rules = (updatedAt: string, label: string, table: number) =>
    ({
      id: "rules:c1", courseId: "c1", source: "manual", schemaVersion: 1, updatedAt,
      components: [{ id: "zh", label, kind: "exam", scale: { kind: "points", max: 50 } }],
      retakes: [], derived: [], tables: [{ id: "t", rows: [{ min: 0, value: 1 }, { min: table, value: 2 }] }],
      outcomes: [], flags: [],
    }) as SyncPayload["data"]["requirementRules"][number];
  const base = payload([], { requirementRules: [rules(T0, "ZH", 20)] });
  const local = payload([], { requirementRules: [rules(T1, "ZH (helyi)", 20)] });
  const remote = payload([], { requirementRules: [rules(T2, "ZH", 25)] });
  const merged = mergeAppData(base, local, remote, NOW).data.requirementRules[0];
  // A field-level merge would combine the local label with the remote table.
  assert.equal(merged.components[0].label, "ZH");
  assert.equal(merged.tables[0].rows[1].min, 25);
});

test("results from two devices merge field by field under one deterministic id", () => {
  const result = (updatedAt: string, points: number) => ({
    id: "c1|zh|n:1", courseId: "c1", componentId: "zh", instanceKey: "n:1", state: "recorded" as const,
    value: { kind: "points" as const, points }, updatedAt,
  });
  const base = payload([], { requirementResults: [] });
  const local = payload([], { requirementResults: [result(T1, 30)] });
  const remote = payload([], { requirementResults: [result(T2, 35)] });
  const merged = mergeAppData(base, local, remote, NOW).data.requirementResults;
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].value, { kind: "points", points: 35 });
});

test("merging with a document from before requirements existed keeps the local ones", () => {
  const result = { id: "c1|zh|n:1", courseId: "c1", componentId: "zh", instanceKey: "n:1", state: "na" as const, updatedAt: T1 };
  const old = payload();
  delete (old.data as Partial<SyncPayload["data"]>).requirementResults;
  delete (old.data as Partial<SyncPayload["data"]>).requirementRules;
  const merged = mergeAppData(old, payload([], { requirementResults: [result] }), old, NOW).data;
  assert.equal(merged.requirementResults.length, 1);
  assert.deepEqual(merged.requirementRules, []);
});
