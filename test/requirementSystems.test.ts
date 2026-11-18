import test from "node:test";
import assert from "node:assert/strict";
import { componentCourseIds, planRequirementSystem, removeRequirementCourse, rulesForCourse, systemCourseIds } from "@/lib/rules/system";
import { resultId, type RequirementResult, type RequirementRules } from "@/lib/rules/types";
import { pendingInputs, type CatchUpInput } from "@/lib/catchup";
import { attendanceGroups, attendanceGroupId, attendanceSummary, reconcileAttendance } from "@/lib/attendance";
import { autoLinks } from "@/lib/rules/links";
import { evaluate } from "@/lib/rules/engine";
import { requirementActions } from "@/lib/store/requirements";
import { parseAppData } from "@/lib/importData";
import { makeCourse, emptyAppData } from "./helpers";
import type { AppStore, StoreSet } from "@/lib/store";
import type { ClassSession } from "@/lib/types";
import { buildCalendar } from "@/lib/ical/export";

const ea = { ...makeCourse("ea", "Analízis I Ea"), code: "IP-18AN1E 1", semester: "2026/27/1" };
const gy = { ...makeCourse("gy", "Analízis I Gy"), code: "IP-18AN1G 4", semester: "2026/27/1" };
const session = (courseId: string): ClassSession => ({ id: `local-${courseId}`, sourceId: "source", externalUid: `uid-${courseId}`,
  courseId, kind: "ora", subject: `Analízis ${courseId}`, subjectKey: `analizis ${courseId}`, group: courseId === "gy" ? "4" : "1",
  teachers: [], start: "2026-11-17T08:00:00Z", end: "2026-11-17T09:30:00Z" });
function system(courseId = "ea"): RequirementRules {
  return { id: `rules:${courseId}`, courseId, source: "manual", schemaVersion: 1,
    components: [{ id: "jelen", label: "Jelenlét", kind: "attendance", limit: { maxAbsences: 3, countExcused: true, onExceed: "none" } },
      { id: "zh", label: "ZH", kind: "exam", scale: { kind: "points", max: 100 } }],
    derived: [], retakes: [], flags: [], tables: [], outcomes: [
      { id: "gyak", label: "Gyakorlati jegy", kind: "gyakorlat", select: "first", paths: [{ id: "alap", label: "ZH", grade: "if(zh >= 50, 4, 1)" }] },
      { id: "ajanlott", label: "Megajánlott", kind: "megajanlott", select: "first", paths: [{ id: "alap", label: "Gyakorlat", grade: "grade(gyak)" }] },
    ] };
}
const result = (courseId: string, points: number): RequirementResult => ({ id: resultId(courseId, "zh", "n:1"), courseId,
  componentId: "zh", instanceKey: "n:1", state: "recorded", value: { kind: "points", points } });
const shared = (): RequirementRules => ({ ...system(), courseIds: ["ea", "gy"], componentCourses: { jelen: ["gy"], zh: ["gy"] },
  calendarLinks: { jelen: { mode: "sessions", selector: {}, since: "2026-11-01T00:00:00Z" } } });
function input(): CatchUpInput { return { courses: [ea, gy], rules: [shared()], results: [], sessions: [session("ea"), session("gy")], deadlines: [],
  attendancePrefs: { enabled: true, since: "2026-11-01T00:00:00Z" }, now: new Date("2026-11-18T10:00:00Z") }; }

function storeHarness() {
  let state = { ...emptyAppData(), courses: [ea, gy], classSessions: [session("ea"), session("gy")], ...requirementActions(set) } as AppStore;
  function set(patch: Parameters<StoreSet>[0]) { state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) }; }
  return { get: () => state, set };
}

test("a shared rule system is resolved from either course and assignments stay explicit", () => {
  const r = shared(); assert.equal(rulesForCourse([r], "gy"), r); assert.equal(rulesForCourse([r], "ea"), r);
  assert.deepEqual(componentCourseIds(r, "jelen"), ["gy"]);
  assert.deepEqual(componentCourseIds({ ...r, componentCourses: undefined }, "jelen"), []);
  assert.deepEqual(componentCourseIds(system(), "jelen"), ["ea"]);
});

test("both pages write to one canonical ledger, updating connected outcomes", () => {
  const h = storeHarness(); h.set({ requirementRules: [shared()] });
  h.get().setRequirementResult("gy", "zh", "n:1", { state: "recorded", value: { kind: "points", points: 70 } });
  h.get().setRequirementResult("ea", "zh", "n:1", { state: "recorded", value: { kind: "points", points: 80 } });
  assert.equal(h.get().requirementResults.length, 1);
  assert.equal(h.get().requirementResults[0].courseId, "ea");
  const ev = evaluate(shared(), h.get().requirementResults, new Date("2026-11-18T10:00:00Z"));
  assert.deepEqual(ev.outcomes.map((o) => o.current), [4, 4]);
  h.get().setRequirementRules("gy", { ...system(), source: "manual" });
  assert.deepEqual(systemCourseIds(h.get().requirementRules[0]), ["ea", "gy"]);
  h.get().setRequirementResult("gy", "attendance_manual", "m:1", { state: "recorded", value: { kind: "attendance", status: "unexcused" } });
  assert.equal(h.get().requirementResults[1].courseId, "gy", "standalone attendance remains owned by its class course");
});

test("practice attendance consumes only practice classes and catch-up groups once by the real course", () => {
  const i = input();
  let groups = pendingInputs(i);
  assert.equal(groups.length, 2);
  const practice = groups.find((g) => g.session?.courseId === "gy")!;
  assert.equal(practice.courseId, "gy"); assert.equal(practice.fields.length, 1);
  assert.equal(practice.fields[0].courseId, "ea"); assert.equal(practice.fields[0].target.id, "jelen");
  const standalone = attendanceGroupId(session("gy"));
  i.results = [{ id: resultId("gy", standalone, "s:uid-gy"), courseId: "gy", componentId: standalone, instanceKey: "s:uid-gy",
    state: "recorded", value: { kind: "attendance", status: "unexcused" } }];
  i.results = reconcileAttendance(i);
  assert.equal(i.results[0].courseId, "ea"); assert.equal(i.results[0].componentId, "jelen");
  const a = attendanceGroups(i);
  const practiceGroup = a.find((g) => g.target.id === "jelen")!;
  assert.equal(practiceGroup.instances.length, 1); assert.equal(attendanceSummary(practiceGroup, i.now).remaining, 2);
  const lectureGroup = a.find((g) => !g.linked)!;
  assert.equal(attendanceSummary(lectureGroup, i.now).absences, 0);
  i.courses = i.courses.map((c) => c.id === "gy" ? { ...c, attendanceReminders: false } : c); i.results = [];
  groups = pendingInputs(i); assert.ok(groups.every((g) => g.session?.courseId !== "gy"));
});

test("merging populated trackers requires explicit choices and preserves old results", () => {
  const h = storeHarness(); h.set({ requirementRules: [system("ea"), system("gy")], requirementResults: [result("ea", 60), result("gy", 80)] });
  const scopes = { jelen: ["gy"], zh: ["gy"] };
  const plan = planRequirementSystem(h.get().requirementRules, h.get().requirementResults, system("ea"), ["ea", "gy"], scopes);
  assert.equal(plan.conflicts.length, 1); assert.equal(plan.previousSystems.length, 2);
  assert.equal(h.get().configureRequirementSystem(system("ea"), ["ea", "gy"], scopes), false);
  const choice = { [plan.conflicts[0].key]: result("gy", 80).id };
  assert.equal(h.get().configureRequirementSystem(system("ea"), ["ea", "gy"], scopes, choice), true);
  assert.equal(h.get().requirementRules.length, 1); assert.equal(h.get().requirementResults.length, 1);
  assert.deepEqual(h.get().requirementResults[0].value, { kind: "points", points: 80 });
  const snapshots = h.get().requirementRules[0].previousSystems!;
  assert.equal(snapshots.flatMap((s) => s.results).length, 2);
  const imported = parseAppData(JSON.parse(JSON.stringify(h.get())));
  assert.equal(imported.requirementRules[0].previousSystems!.flatMap((s) => s.results).length, 2);
  assert.deepEqual(imported.requirementRules[0].componentCourses, scopes);
});

test("different scoring remains in history, never interpreted using the new scale", () => {
  const h = storeHarness(); const other = system("gy");
  other.components[1] = { id: "zh", label: "ZH", kind: "exam", scale: { kind: "points", max: 20 } };
  h.set({ requirementRules: [system(), other], requirementResults: [result("gy", 18)] });
  assert.equal(h.get().configureRequirementSystem(system(), ["ea", "gy"], { jelen: ["gy"], zh: ["gy"] }), true);
  assert.equal(h.get().requirementResults.length, 0);
  assert.equal(h.get().requirementRules[0].previousSystems![1].results[0].value?.kind, "points");
});

test("unassigned items do not auto-link or generate class reminders", () => {
  const i = input(); i.rules[0] = { ...shared(), componentCourses: { jelen: [], zh: [] } };
  assert.equal(autoLinks(i.rules[0], i.sessions, [], [], "2026-11-01T00:00:00Z").jelen, undefined);
  assert.ok(pendingInputs(i).every((g) => g.fields.every((f) => f.target.id !== "jelen")));
});

test("deleting a canonical course rehomes the shared rules and results to the surviving member", () => {
  const moved = removeRequirementCourse([shared()], [result("ea", 70)], "ea");
  assert.equal(moved.requirementRules.length, 1); assert.equal(moved.requirementRules[0].courseId, "gy");
  assert.equal(moved.requirementResults[0].id, resultId("gy", "zh", "n:1"));
  assert.equal(evaluate(moved.requirementRules[0], moved.requirementResults, new Date("2026-11-18T10:00:00Z")).outcomes[0].current, 4);
});

test("shared members cannot cross semesters", () => {
  const h = storeHarness(); h.set({ courses: [ea, { ...gy, semester: "2025/26/1" }], requirementRules: [system()] });
  assert.equal(h.get().configureRequirementSystem(system(), ["ea", "gy"], { jelen: ["gy"], zh: ["gy"] }), false);
});

test("calendar record links point to the actual member class with one canonical result field", () => {
  const i = input();
  const text = buildCalendar({ courses: i.courses, deadlines: [], classSessions: i.sessions, options: { includeClasses: true },
    now: i.now, appUrl: "https://app.example.test", requirements: { rules: i.rules, results: [], semester: undefined } }).replace(/\r\n[ \t]/g, "");
  assert.ok(text.includes(encodeURIComponent("gy|s:uid-gy")));
  assert.ok(!text.includes(encodeURIComponent("ea|s:uid-gy")));
});

test("concurrent overlapping joins retain one system and preserve the other ledger for review", async () => {
  const { mergeAppData } = await import("@/lib/sync/merge");
  const { DEFAULT_EXPORT_OPTIONS } = await import("@/lib/ical/export");
  const base = { data: { ...emptyAppData(), courses: [ea, gy] }, exportOptions: DEFAULT_EXPORT_OPTIONS };
  const local = { ...base, data: { ...base.data, requirementRules: [{ ...shared(), updatedAt: "2026-11-18T12:00:00Z" }], requirementResults: [result("ea", 60)] } };
  const remote = { ...base, data: { ...base.data, requirementRules: [{ ...system("gy"), updatedAt: "2026-11-18T11:00:00Z" }], requirementResults: [result("gy", 80)] } };
  const merged = mergeAppData(base, local, remote).data;
  assert.equal(merged.requirementRules.length, 1);
  assert.equal(merged.requirementRules[0].courseId, "ea");
  assert.ok(merged.requirementRules[0].flags.some((f) => f.code === "sharedSystemConflict" && !f.resolved));
  assert.equal(merged.requirementRules[0].previousSystems![0].results[0].courseId, "gy");
  assert.deepEqual(systemCourseIds(parseAppData(merged).requirementRules[0]), ["ea", "gy"]);
});

test("public templates exclude private course membership, calendar links, and previous results", async () => {
  const { shareableRules } = await import("@/lib/rules/shared");
  const privateRules = { ...shared(), previousSystems: [{ rules: system("gy"), results: [result("gy", 80)] }] };
  const sharedRules = shareableRules(privateRules);
  assert.ok(!("courseIds" in sharedRules)); assert.ok(!("componentCourses" in sharedRules));
  assert.ok(!("calendarLinks" in sharedRules)); assert.ok(!("previousSystems" in sharedRules));
});

test("changing attendance assignments retains old class attendance on its actual teaching course", () => {
  const h = storeHarness();
  h.set({ requirementRules: [shared()], requirementResults: [{ id: resultId("ea", "jelen", "s:uid-gy"), courseId: "ea", componentId: "jelen", instanceKey: "s:uid-gy", state: "na" }] });
  assert.equal(h.get().configureRequirementSystem(shared(), ["ea", "gy"], { jelen: ["ea"], zh: ["gy"] }), true);
  const old = h.get().requirementResults.find((r) => r.courseId === "gy")!;
  assert.equal(old.state, "na"); assert.ok(old.componentId.startsWith("attendance_"));
  const view = attendanceGroups({ courses: h.get().courses, sessions: h.get().classSessions, rules: h.get().requirementRules, results: h.get().requirementResults });
  assert.equal(view.find((g) => !g.linked && g.courseId === "gy")?.instances[0].result?.state, "na");
});
