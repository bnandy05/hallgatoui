import test from "node:test";
import assert from "node:assert/strict";
import { attendanceGroups, attendanceGroupId, attendanceSummary, reconcileAttendance } from "@/lib/attendance";
import { pendingInputs, type CatchUpInput } from "@/lib/catchup";
import { resultId, type RequirementResult, type RequirementRules } from "@/lib/rules/types";
import type { ClassSession } from "@/lib/types";
import { makeCourse, emptyAppData } from "./helpers";
import { parseAppData } from "@/lib/importData";
import { mergeAppData } from "@/lib/sync/merge";
import { DEFAULT_EXPORT_OPTIONS } from "@/lib/ical/export";
import { archiveSemester } from "@/lib/semesterArchive";

const session = (uid: string, end = "2026-10-07T09:30:00Z", group = "Gy"): ClassSession => ({
  id: `local-${uid}`, sourceId: "source", externalUid: uid, subject: "Algebra", subjectKey: "algebra", group,
  kind: "ora", teachers: [], start: end.replace("09:30", "08:00"), end, courseId: "c",
});
function input(): CatchUpInput {
  return { courses: [makeCourse("c", "Algebra")], rules: [], results: [], deadlines: [],
    sessions: [session("old", "2026-09-01T09:30:00Z"), session("new"), session("future", "2026-10-09T09:30:00Z")],
    attendancePrefs: { enabled: true, since: "2026-10-01T00:00:00Z" }, now: new Date("2026-10-08T10:00:00Z") };
}
function absent(componentId: string, key = "s:new", status: "present" | "unexcused" | "excused" = "unexcused"): RequirementResult {
  return { id: resultId("c", componentId, key), componentId, courseId: "c", instanceKey: key, state: "recorded",
    value: { kind: "attendance", status }, updatedAt: "2026-10-08T09:00:00Z" };
}
function rules(): RequirementRules {
  return { id: "rules:c", courseId: "c", source: "manual", schemaVersion: 1, components: [
    { id: "presence", kind: "attendance", label: "Practice", limit: { maxAbsences: 3, countExcused: false, onExceed: "none" } },
  ], flags: [], derived: [], tables: [], outcomes: [], retakes: [], calendarLinks: { presence: { mode: "sessions", selector: {}, since: "2026-09-01T00:00:00Z" } } };
}

test("rule-free check-ins start from activation; history includes old and unrecorded classes", () => {
  const i = input();
  assert.deepEqual(pendingInputs(i).map((g) => g.session?.externalUid), ["new"]);
  const g = attendanceGroups(i)[0];
  assert.equal(g.instances.length, 3);
  assert.deepEqual(attendanceSummary(g, i.now), { absences: 0, unrecorded: 2, limit: undefined, remaining: undefined, tone: "normal" });
  i.results = [absent(g.target.id)];
  assert.equal(pendingInputs(i).length, 0);
  assert.equal(attendanceSummary(attendanceGroups(i)[0], i.now).absences, 1);
  i.results = [{ ...i.results[0], state: "na", value: undefined }];
  assert.equal(pendingInputs(i).length, 0);
  assert.equal(attendanceSummary(attendanceGroups(i)[0], i.now).absences, 0);
});

test("both switches suppress prompts while keeping manual history available", () => {
  const i = input();
  i.attendancePrefs!.enabled = false;
  assert.equal(pendingInputs(i).length, 0);
  assert.equal(attendanceGroups(i)[0].instances.length, 3);
  i.attendancePrefs!.enabled = true;
  i.courses[0].attendanceReminders = false;
  assert.equal(pendingInputs(i).length, 0);
  i.rules = [rules()];
  assert.equal(pendingInputs(i).length, 0);
});

test("lecture and practice groups have separate totals and confirmed limits; duplicate imports count once", () => {
  const i = input();
  const practice = attendanceGroupId(session("new"));
  const lecture = attendanceGroupId(session("lecture", undefined, "Ea"));
  assert.notEqual(practice, lecture);
  assert.equal(attendanceGroupId({ ...session("new"), id: "another-device" } as ClassSession), practice);
  i.sessions.push({ ...session("new"), id: "duplicate" }, session("lecture", undefined, "Ea"));
  i.courses[0].attendanceLimits = { [practice]: 3 };
  i.results = [absent(practice)];
  const groups = attendanceGroups(i);
  assert.equal(groups.length, 2);
  const p = groups.find((g) => g.target.id === practice)!;
  assert.equal(p.instances.length, 3);
  assert.equal(attendanceSummary(p, i.now).remaining, 2);
  assert.equal(attendanceSummary(groups.find((g) => g.target.id === lecture)!, i.now).limit, undefined);
});

test("linking requirements transfers answers once and keeps grading and attendance in agreement", () => {
  const i = input();
  i.results = [absent(attendanceGroupId(session("new")))];
  i.rules = [rules()];
  i.results = reconcileAttendance(i);
  assert.equal(i.results.length, 1);
  assert.equal(i.results[0].componentId, "presence");
  assert.equal(i.results[0].id, resultId("c", "presence", "s:new"));
  assert.equal(reconcileAttendance(i), i.results);
  assert.equal(attendanceGroups(i).length, 1);
  assert.equal(attendanceSummary(attendanceGroups(i)[0], i.now).absences, 1);
  assert.equal(pendingInputs(i).length, 0);
  i.results[0] = absent("presence", "s:new", "excused");
  assert.equal(attendanceSummary(attendanceGroups(i)[0], i.now).absences, 0);
  i.rules = [];
  assert.equal(attendanceSummary(attendanceGroups(i)[0], i.now).absences, 1);
});

test("later answers win when linking or merging an offline standalone record", () => {
  const i = input();
  i.rules = [rules()];
  i.results = [absent(attendanceGroupId(session("new"))), { ...absent("presence", "s:new", "present"), updatedAt: "2026-10-08T10:00:00Z" }];
  const results = reconcileAttendance(i);
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].value, { kind: "attendance", status: "present" });
});

test("manual classes work without timetable or requirements and respect warning thresholds", () => {
  const i = input(); i.sessions = [];
  const id = attendanceGroups(i)[0].target.id;
  i.courses[0].attendanceLimits = { [id]: 3 };
  i.results = [1, 2, 3, 4].map((n) => ({ ...absent(id, `m:${n}`), at: "2026-10-06T08:00:00Z" }));
  assert.equal(attendanceSummary(attendanceGroups(i)[0], i.now).remaining, -1);
  assert.equal(attendanceSummary(attendanceGroups(i)[0], i.now).tone, "danger");
  i.results = i.results.slice(0, 2);
  assert.equal(attendanceSummary(attendanceGroups(i)[0], i.now).tone, "warning");
});

test("backup, semester archive, and concurrent settings sync preserve attendance", () => {
  const i = input();
  const id = attendanceGroupId(session("new"));
  const data = { ...emptyAppData(), courses: [{ ...i.courses[0], attendanceLimits: { [id]: 3 } }], classSessions: i.sessions,
    requirementResults: [absent(id)], attendancePrefs: i.attendancePrefs };
  const parsed = parseAppData(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(parsed.attendancePrefs, i.attendancePrefs);
  assert.equal(parsed.courses[0].attendanceLimits?.[id], 3);
  assert.equal(parsed.requirementResults.length, 1);
  const archived = archiveSemester(parsed, "Autumn", "2026-12-01T00:00:00Z")!;
  assert.equal(archived.semesterArchives![0].data.requirementResults.length, 1);
  const payload = { data, exportOptions: DEFAULT_EXPORT_OPTIONS };
  const local = { ...payload, data: { ...data, attendancePrefs: { enabled: false, since: i.attendancePrefs!.since, updatedAt: "2026-10-08T11:00:00Z" } } };
  const remote = { ...payload, data: { ...data, attendancePrefs: { enabled: true, since: "2026-10-02T00:00:00Z", updatedAt: "2026-10-08T10:00:00Z" } } };
  const merged = mergeAppData(payload, local, remote).data;
  assert.equal(merged.attendancePrefs?.enabled, false);
  assert.equal(merged.attendancePrefs?.since, i.attendancePrefs!.since);
  assert.equal(merged.requirementResults.length, 1);
});

test("import drops malformed limits and preferences", () => {
  const data = { ...emptyAppData(), courses: [{ ...makeCourse("c", "Algebra"), attendanceLimits: { bad: -1, okay: 3, huge: 1e8 }, attendanceReminders: "yes" }], attendancePrefs: { enabled: true, since: "invalid" } };
  const parsed = parseAppData(data);
  assert.deepEqual(parsed.courses[0].attendanceLimits, { okay: 3 });
  assert.equal(parsed.courses[0].attendanceReminders, undefined);
  assert.equal(parsed.attendancePrefs, undefined);
});

test("weekly attendance links cover the same calendar class and transfer its answer", () => {
  const i = input();
  i.sessions = [session("new")];
  i.semester = { start: "2026-09-07" };
  const r = rules();
  r.calendarLinks = { presence: { mode: "weeks", weeks: [5], since: "2026-09-01T00:00:00Z" } };
  i.rules = [r];
  assert.equal(attendanceGroups(i).length, 1);
  assert.equal(pendingInputs(i).length, 1);
  i.results = [absent(attendanceGroupId(session("new")))];
  i.results = reconcileAttendance(i);
  assert.equal(i.results.length, 1);
  assert.equal(i.results[0].instanceKey, "w:5");
  assert.equal(i.results[0].id, resultId("c", "presence", "w:5"));
  assert.equal(pendingInputs(i).length, 0);
  assert.equal(attendanceSummary(attendanceGroups(i)[0], i.now).absences, 1);
});

test("existing linked attendance and detached manual absences remain visible", () => {
  const i = input();
  i.rules = [rules()];
  i.results = [absent("presence", "s:new"), absent("presence", "n:1")];
  assert.equal(attendanceSummary(attendanceGroups(i)[0], i.now).absences, 2);
  i.rules = [];
  assert.equal(attendanceGroups(i).reduce((n, g) => n + attendanceSummary(g, i.now).absences, 0), 2);
});
