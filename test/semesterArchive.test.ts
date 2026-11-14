import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveSemester } from "@/lib/semesterArchive";
import { parseAppData } from "@/lib/importData";
import { saveData, validateAppData } from "@/lib/server/validate";
import { createMemoryAccountStore } from "@/lib/server/account/memoryStore";
import { DEFAULT_EXPORT_OPTIONS } from "@/lib/ical/export";
import { mergeAppData } from "@/lib/sync/merge";
import type { AppData } from "@/lib/types";
import { emptyAppData, makeCourse, makeDeadline, makeFeed } from "./helpers";

const ARCHIVED_AT = "2026-11-12T10:00:00.000Z";
const FIRST = {
  ...emptyAppData(),
  courses: [makeCourse("c", "Algebra")],
  deadlines: [makeDeadline({ id: "problem", courseId: "c" })],
  feeds: [makeFeed({ courseId: "c" })],
  requirementResults: [{
    id: "c|exam|n:1", courseId: "c", componentId: "exam", instanceKey: "n:1", state: "recorded" as const,
    value: { kind: "points" as const, points: 38 },
  }],
  semester: { start: "2026-09-07" },
};
const payload = (data: AppData) => ({ data, exportOptions: DEFAULT_EXPORT_OPTIONS });

function nextSemester(data: AppData, name = "2026 autumn"): AppData {
  const patch = archiveSemester(data, name, ARCHIVED_AT);
  assert.ok(patch);
  return { ...data, ...patch };
}

test("archive clears active data and keeps a valid backup, including results and the semester start", () => {
  const next = nextSemester(FIRST);
  assert.deepEqual(next.courses, []);
  assert.deepEqual(next.deadlines, []);
  assert.deepEqual(next.feeds, []);
  assert.deepEqual(next.requirementResults, []);
  assert.equal(next.semester, undefined);
  const stored = validateAppData(next);
  assert.equal(stored?.semesterNumber, 1);
  const restored = parseAppData(JSON.parse(JSON.stringify(stored)));
  assert.equal(restored.semesterArchives?.[0].name, "2026 autumn");
  assert.equal(restored.semesterArchives?.[0].data.semester?.start, FIRST.semester.start);
  assert.deepEqual(restored.semesterArchives?.[0].data.requirementResults, FIRST.requirementResults);
  assert.equal(restored.semesterArchives?.[0].data.feeds[0].id, FIRST.feeds[0].id);
  assert.equal(archiveSemester(next, "Empty semester", ARCHIVED_AT), null);
  assert.throws(() => parseAppData({ ...next, semesterNumber: 0 }));
});

test("archiving an oversized active timetable retains all its sessions", () => {
  const data: AppData = {
    ...FIRST,
    classSessions: Array.from({ length: 1501 }, (_, i) => ({
      id: `s${i}`, sourceId: "source", externalUid: `u${i}`, subject: "Algebra", subjectKey: "algebra", kind: "ora",
      teachers: [], start: "2026-10-12T09:00:00Z", end: "2026-10-12T10:00:00Z", courseId: "c",
    })),
  };
  assert.equal(validateAppData(data), null);
  const archived = validateAppData(nextSemester(data));
  assert.equal(archived?.semesterArchives?.[0].data.classSessions.length, 1501);
});

test("late edits from another device merge into the archived semester", () => {
  const local = {
    ...FIRST,
    deadlines: [{ ...FIRST.deadlines[0], done: true }, makeDeadline({ id: "offline", courseId: "c" })],
  };
  const remote = { ...nextSemester(FIRST), deadlines: [makeDeadline({ id: "next-term" })] };
  const merged = mergeAppData(payload(FIRST), payload(local), payload(remote), ARCHIVED_AT).data;
  assert.deepEqual(merged.deadlines.map((deadline) => deadline.id), ["next-term"]);
  assert.deepEqual(merged.semesterArchives?.[0].data.deadlines.map(({ id, done }) => [id, done]), [["problem", true], ["offline", false]]);
});

test("two devices archiving the same semester merge both new boards and retain a single archive", () => {
  const local = { ...nextSemester(FIRST), deadlines: [makeDeadline({ id: "local" })] };
  const remote = { ...nextSemester(FIRST), deadlines: [makeDeadline({ id: "remote" })] };
  const merged = mergeAppData(payload(FIRST), payload(local), payload(remote), ARCHIVED_AT).data;
  assert.deepEqual(merged.deadlines.map((deadline) => deadline.id), ["remote", "local"]);
  assert.equal(merged.semesterArchives?.length, 1);
  assert.equal(merged.semesterArchives?.[0].data.deadlines[0].id, "problem");
});

test("a client that omits the newer semester cannot overwrite an archive", async () => {
  const store = createMemoryAccountStore();
  const now = new Date(ARCHIVED_AT);
  const archived = nextSemester(FIRST);
  assert.deepEqual(await saveData(store, "u", 0, archived, DEFAULT_EXPORT_OPTIONS, now), { ok: true, version: 1 });
  assert.deepEqual(await saveData(store, "u", 1, FIRST, DEFAULT_EXPORT_OPTIONS, now), {
    ok: false, current: null, staleSemester: true,
  });
  assert.deepEqual((await store.getData("u"))?.data, JSON.parse(JSON.stringify(archived)));
  await store.deleteData("u");
  assert.deepEqual(await saveData(store, "u", 0, FIRST, DEFAULT_EXPORT_OPTIONS, now), { ok: true, version: 1 });
});
