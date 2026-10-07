import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIcs } from "@/lib/ical/parse";
import { mergeTimetableImport, parseNeptunEvents } from "@/lib/ical/neptun";
import { normalizeSemesterStart, proposeSemesterStart, proposeSemesterStartAt, semesterWeek, weekBounds } from "@/lib/timetable/semester";
import { instanceLabel, instanceSnapshot, resolveInstances, SINGLE_KEY } from "@/lib/rules/instances";
import { autoLinks, defaultDeadlineLinks, defaultLinks, linkFrom, linksFrom, linkTargets, type ComponentLink } from "@/lib/rules/links";
import { awaitingResults, linkedInstances, pendingInputs, shouldPrompt, upcomingAssessments, type CatchUpInput } from "@/lib/catchup";
import { buildReminders } from "@/lib/reminders";
import { courseStanding } from "@/lib/rules/standing";
import { resultId, type RequirementResult, type RequirementRules } from "@/lib/rules/types";
import { deadlineIdentity } from "@/lib/ical/dedupe";
import type { SemesterInfo, TimetableSource } from "@/lib/types";
import { readFixture } from "./fixtures";
import { makeCourse, makeDeadline } from "./helpers";
import { rules as template } from "./rulesHelpers";

const parsed = parseNeptunEvents(parseIcs(readFixture("neptun-orarend.ics")));
const source: TimetableSource = {
  id: "src1",
  name: "Neptun órarend",
  importedAt: "2026-09-01T00:00:00.000Z",
  // Programming theory: the lecture (group 1) is skipped, the practice (group 6) is its own course.
  subjectCourses: { "programming theory|6": "c", "programming theory|1": null },
};
const sessions = mergeTimetableImport(source, parsed, []);
const semester: SemesterInfo = { start: "2026-09-07" };
const course = makeCourse("c", "Programozáselmélet gyakorlat");
const SINCE = "2026-09-27T22:00:00.000Z"; // Monday 28 Sept 00:00 Budapest (week 4)

const quiz1 = makeDeadline({ id: "q1", courseId: "c", title: "1. kvíz", due: "2026-09-30T21:59:00.000Z", source: "ical", feedId: "f", externalUid: "quiz-1" });
const quiz2 = makeDeadline({ id: "q2", courseId: "c", title: "2. kvíz", due: "2026-10-14T21:59:00.000Z", source: "ical", feedId: "f", externalUid: "quiz-2" });

function progelmRules(links: Record<string, ComponentLink>): RequirementRules {
  return { ...template("elte-ik-progelm"), id: "rules:c", courseId: "c", source: "template", calendarLinks: links };
}

const LINKS: Record<string, ComponentLink> = {
  jelen: { mode: "sessions", selector: {}, since: SINCE },
  pm: { mode: "sessions", selector: { fromWeek: 2 }, since: SINCE },
  kviz: { mode: "deadlines", identities: [deadlineIdentity(quiz1), deadlineIdentity(quiz2)], since: SINCE },
  zh1: { mode: "weeks", weeks: [7], since: SINCE },
  pot: { mode: "weeks", weeks: [8], since: SINCE },
};

function input(results: RequirementResult[] = [], now = new Date("2026-10-07T12:00:00Z")): CatchUpInput {
  return { courses: [course], rules: [progelmRules(LINKS)], results, sessions, deadlines: [quiz1, quiz2], semester, now };
}

const rec = (componentId: string, instanceKey: string, extra: Partial<RequirementResult> = {}): RequirementResult => ({
  id: resultId("c", componentId, instanceKey),
  courseId: "c",
  componentId,
  instanceKey,
  state: "recorded",
  value: { kind: "attendance", status: "present" },
  ...extra,
});

test("teaching weeks count from the Monday of the start, on the Budapest calendar", () => {
  assert.equal(normalizeSemesterStart("2026-09-09"), "2026-09-07");
  assert.equal(normalizeSemesterStart("2026-02-30"), null);
  assert.equal(semesterWeek(semester, new Date("2026-09-07T06:00:00Z")), 1);
  assert.equal(semesterWeek(semester, new Date("2026-10-06T06:00:00Z")), 5);
  // Sunday 23:30 Budapest is still week 1, although it is Sunday 21:30 UTC.
  assert.equal(semesterWeek(semester, new Date("2026-09-13T21:30:00Z")), 1);
  assert.equal(semesterWeek(semester, new Date("2026-09-13T22:30:00Z")), 2);
  const w8 = weekBounds(semester, 8)!;
  assert.equal(w8.from.toISOString(), "2026-10-25T23:00:00.000Z"); // Monday 26 Oct, CET after the DST change
  assert.equal(proposeSemesterStart(sessions), "2026-09-07");
});

test("a sessions link takes the course's classes; the week filter and limit apply", () => {
  const rules = progelmRules(LINKS);
  const ctx = { courseId: "c", sessions, deadlines: [], semester, results: [] };
  const targets = linkTargets(rules);
  const jelen = resolveInstances(targets.find((t) => t.id === "jelen")!, LINKS.jelen, ctx);
  assert.equal(jelen.length, 13); // group 6 only: the skipped lecture has no course
  assert.ok(jelen.every((i) => i.key.startsWith("s:SDA637e68")));
  assert.equal(jelen[0].week, 1);
  assert.equal(instanceLabel(jelen[0]), "szept. 8. (K) 08:00 · 1. hét");
  // Week 8 is the autumn break: no class.
  assert.deepEqual(jelen.map((i) => i.week), [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14]);
  assert.deepEqual(jelen.map((i) => i.tracked), [false, false, false, true, true, true, true, true, true, true, true, true, true]);

  const pmTarget = targets.find((t) => t.id === "pm")!;
  const pm = resolveInstances(pmTarget, LINKS.pm, ctx);
  assert.equal(pm.length, 12);
  assert.equal(pm[0].week, 2);
  const limited = resolveInstances(pmTarget, { mode: "sessions", selector: {}, limit: 3 }, ctx);
  assert.deepEqual(limited.map((i) => i.week), [1, 2, 3]);
  // A class that didn't happen doesn't use up an item.
  const na = rec("pm", limited[1].key, { state: "na", value: undefined });
  const withNa = resolveInstances(pmTarget, { mode: "sessions", selector: {}, limit: 3 }, { ...ctx, results: [na] });
  assert.deepEqual(withNa.map((i) => i.week), [1, 2, 3, 4]);
});

test("single-result components keep the key n:1; weeks give the date, or the whole week", () => {
  const ctx = { courseId: "c", sessions, deadlines: [], semester, results: [] };
  const targets = linkTargets(progelmRules(LINKS));
  const [zh1] = resolveInstances(targets.find((t) => t.id === "zh1")!, LINKS.zh1, ctx);
  assert.equal(zh1.key, SINGLE_KEY);
  assert.equal(zh1.at, "2026-10-20T06:00:00.000Z");
  const [pot] = resolveInstances(targets.find((t) => t.id === "pot")!, LINKS.pot, ctx);
  assert.equal(pot.key, SINGLE_KEY);
  assert.equal(pot.session, undefined);
  assert.equal(pot.at, "2026-10-25T23:00:00.000Z");
  assert.equal(pot.end, "2026-11-01T22:59:00.000Z");
  assert.equal(instanceLabel(pot), "8. hét");
});

test("a result whose instance is no longer selected stays, pinned, with its snapshot", () => {
  const ctx = { courseId: "c", sessions, deadlines: [], semester, results: [] as RequirementResult[] };
  const target = linkTargets(progelmRules(LINKS)).find((t) => t.id === "pm")!;
  const all = resolveInstances(target, LINKS.pm, ctx);
  const result = rec("pm", "s:gone-uid", { value: { kind: "pm", sign: "+" }, at: "2026-09-01T06:00:00.000Z", label: "szept. 1. (K) 08:00" });
  const withOrphan = resolveInstances(target, LINKS.pm, { ...ctx, results: [result] });
  assert.equal(withOrphan.length, all.length + 1);
  const orphan = withOrphan.find((i) => i.pinned)!;
  assert.equal(orphan.key, "s:gone-uid");
  assert.equal(instanceLabel(orphan), "szept. 1. (K) 08:00");
  assert.deepEqual(instanceSnapshot(all[0]), { at: all[0].at, label: "szept. 15. (K) 08:00 · 2. hét" });
});

test("catch-up groups ended, tracked classes by session, oldest first", () => {
  const groups = pendingInputs(input());
  // Week 4 and week 5 classes and the first quiz (30 Sept); week 1–3 are before `since`.
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map((g) => g.week ?? null), [4, null, 5]);
  assert.deepEqual(groups[0].fields.map((f) => f.target.id).sort(), ["jelen", "pm"]);
  assert.equal(groups[1].deadline?.id, "q1");
  assert.deepEqual(groups[1].fields.map((f) => f.target.id), ["kviz"]);

  // Recording both answers of a class resolves its group; one answer leaves the other field.
  const week4 = groups[0].fields[0].instance.key;
  const partly = pendingInputs(input([rec("jelen", week4)]));
  assert.equal(partly.length, 3);
  assert.deepEqual(partly[0].fields.map((f) => f.target.id), ["pm"]);
  const both = pendingInputs(input([rec("jelen", week4), rec("pm", week4, { state: "na", value: undefined })]));
  assert.equal(both.length, 2);
});

test("prompting depends only on what ended after the popup was last closed", () => {
  const groups = pendingInputs(input());
  assert.equal(shouldPrompt(groups, undefined), true);
  assert.equal(shouldPrompt(groups, "2026-10-06T08:00:00.000Z"), false); // after the last class
  assert.equal(shouldPrompt(groups, "2026-10-01T00:00:00.000Z"), true);
  assert.equal(shouldPrompt([], undefined), false);
});

test("awaiting results turn late after 14 days; upcoming exams come from week links", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const waiting = rec("zh1", SINGLE_KEY, { state: "pending", value: undefined, at: "2026-09-20T06:00:00.000Z" });
  const fresh = rec("zh2", SINGLE_KEY, { state: "pending", value: undefined, at: "2026-10-01T06:00:00.000Z" });
  const awaiting = awaitingResults({ courses: [course], rules: [progelmRules(LINKS)], results: [waiting, fresh], now });
  assert.deepEqual(awaiting.map((a) => [a.componentLabel, a.overdue]), [["1. zh", true], ["2. zh", false]]);

  const upcoming = upcomingAssessments(input([], new Date("2026-10-10T12:00:00Z")));
  assert.deepEqual(upcoming.map((u) => u.target.id), ["zh1"]); // pot (week 8) is 16+ days away
  assert.deepEqual(upcomingAssessments(input([], new Date("2026-10-20T12:00:00Z"))).map((u) => u.target.id), ["pot"]);
});

test("reminders: the badge counts what needs the student now", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const data = input();
  const linked = linkedInstances(data);
  const pending = pendingInputs(data, linked);
  const overdue = makeDeadline({ id: "o", title: "Lejárt", due: "2026-10-06T10:00:00.000Z" });
  const ancient = makeDeadline({ id: "a", title: "Régi", due: "2026-08-01T10:00:00.000Z" });
  const soon = makeDeadline({ id: "s", title: "Jövő hét", due: "2026-10-12T10:00:00.000Z" });
  const critical = makeDeadline({ id: "k", title: "Holnap", due: "2026-10-08T10:00:00.000Z" });
  const r = buildReminders({ pending, awaiting: [], deadlines: [soon, overdue, ancient, critical], assessments: [], now });
  assert.deepEqual(r.deadlines.map((d) => d.id), ["o", "k", "s"]);
  assert.equal(r.badge, pending.length + 2);
});

test("links from JSON are checked against the component kinds", () => {
  const rules = template("elte-ik-progelm");
  assert.equal(linkFrom({ mode: "sessions", selector: {} }, { kind: "bonus" }), null);
  assert.equal(linkFrom({ mode: "sessions", selector: {} }, { kind: "exam" }), null);
  assert.deepEqual(linkFrom({ mode: "weeks", weeks: [9, 9, 0, "x", 3] }, { kind: "exam" }), { mode: "weeks", weeks: [3, 9] });
  assert.deepEqual(linkFrom({ mode: "deadlines", identities: ["a", "b"] }, { kind: "assignment" }), { mode: "deadlines", identities: ["a"] });
  const links = linksFrom({ jelen: { mode: "sessions", selector: { groups: ["6", 7], weekdays: [9, 2] }, since: "nope" }, nincs: { mode: "weeks", weeks: [1] }, pot: { mode: "weeks", weeks: [8] } }, rules);
  assert.deepEqual(links, { jelen: { mode: "sessions", selector: { groups: ["6"], weekdays: [2] } }, pot: { mode: "weeks", weeks: [8] } });
});

test("deadline suggestions match the component's kind words within the course", async () => {
  const { suggestDeadlineLinks } = await import("@/lib/rules/links");
  const list = [
    makeDeadline({ id: "a", courseId: "c", title: "3. Kvíz (Canvas)", due: "2026-10-03T10:00:00.000Z" }),
    makeDeadline({ id: "b", courseId: "c", title: "Lecture quiz 1", due: "2026-10-01T10:00:00.000Z" }),
    makeDeadline({ id: "c", courseId: "c", title: "Beadandó 1", due: "2026-10-02T10:00:00.000Z" }),
    makeDeadline({ id: "d", courseId: "x", title: "Kvíz", due: "2026-10-02T10:00:00.000Z" }),
    makeDeadline({ id: "e", courseId: "c", title: "Kvízmester verseny", due: "2026-10-02T10:00:00.000Z" }),
  ];
  assert.deepEqual(suggestDeadlineLinks({ kind: "series" }, "c", list).map((d) => d.id), ["b", "a"]);
  assert.deepEqual(suggestDeadlineLinks({ kind: "assignment" }, "c", list).map((d) => d.id), ["c"]);
  assert.deepEqual(suggestDeadlineLinks({ kind: "bonus" }, "c", list), []);
});

test("in-tab notice: once a day, 30 minutes after the last linked class of the day", async () => {
  const { catchUpNotification } = await import("@/lib/notifications");
  // Tuesday 6 Oct: the practice ends at 10:00 Budapest (08:00 UTC).
  const at = (iso: string) => {
    const data = input([], new Date(iso));
    const linked = linkedInstances(data);
    return catchUpNotification(linked, pendingInputs(data, linked), new Set(), new Date(iso));
  };
  assert.equal(at("2026-10-06T08:20:00Z"), null);
  const notice = at("2026-10-06T08:35:00Z");
  assert.equal(notice?.key, "catchup:20261006");
  assert.equal(notice?.body, "Egy mai órád vár adatra.");
  assert.equal(at("2026-10-07T08:05:00Z"), null); // no class on Wednesday
});

test("röpzh is linked to the classes from week 2, attendance to every class, without asking", () => {
  const ropzh = { id: "ropzh", label: "Röpzh-k", kind: "series" as const, item: "ropzh" as const, count: 3, scoring: { kind: "points" as const, max: 2 } };
  const zh = { id: "zh1", label: "Zh", kind: "exam" as const, scale: { kind: "grade" as const } };
  const own = sessions.filter((s) => s.courseId === "c");
  const links = defaultLinks([ropzh, zh], new Set(), own, SINCE);
  const expected: Record<string, ComponentLink> = { ropzh: { mode: "sessions", selector: { fromWeek: 2 }, since: SINCE } };
  assert.deepEqual(links, expected);
  // The first three classes from week 2 on; week 1 has none.
  const items = resolveInstances(ropzh, links.ropzh, { courseId: "c", sessions, deadlines: [], semester, results: [] });
  assert.deepEqual(items.map((i) => i.week), [2, 3, 4]);
  // Not again for a component the rules already had (the user may have removed its link),
  // not without classes, and not when the course mixes two Neptun groups.
  assert.deepEqual(defaultLinks([ropzh], new Set(["ropzh"]), own, SINCE), {});
  assert.deepEqual(defaultLinks([ropzh], new Set(), [], SINCE), {});
  assert.deepEqual(defaultLinks([ropzh], new Set(), [{ kind: "ora", group: "1" }, { kind: "ora", group: "6" }], SINCE), {});
  const attendance = { id: "jelen", label: "Jelenlét", kind: "attendance" as const };
  assert.deepEqual(defaultLinks([attendance], new Set(), own, SINCE), { jelen: { mode: "sessions", selector: {}, since: SINCE } });
  // Online quizzes are not written at the class.
  assert.deepEqual(defaultLinks([{ ...ropzh, item: "quiz" as const }], new Set(), own, SINCE), {});
});

test("assignments, zh-s and quizzes are linked to their deadlines when it is clear", () => {
  const dl = (id: string, title: string, due: string) =>
    makeDeadline({ id, courseId: "c", title, due, source: "ical", feedId: "f", externalUid: id });
  const ident = (d: ReturnType<typeof dl>) => ({ mode: "deadlines" as const, identities: [deadlineIdentity(d)], since: SINCE });
  const assignment = (id: string, label: string) => ({ id, label, kind: "assignment" as const, outcomes: [{ id: "ok", label: "Elfogadva", points: 3, accepted: true }] });
  const exam = (id: string, label: string) => ({ id, label, kind: "exam" as const, scale: { kind: "grade" as const } });
  const b1 = assignment("beadando1", "1. beadandó");
  const b2 = assignment("beadando2", "2. beadandó");
  const zh1 = exam("zh1", "1. zh");
  const zh2 = exam("zh2", "2. zh");
  const theory = exam("elmelet", "Elméleti teszt");

  // By number, whatever the due order; the course name's number does not confuse it.
  const second = dl("a2", "Beadandó 2 – Avalonia", "2026-10-01T10:00:00Z");
  const first = dl("a1", "Beadandó 1 – WinForms", "2026-12-01T10:00:00Z");
  const z1 = dl("z1", "Analízis 2 ZH1", "2026-10-20T10:00:00Z");
  const z2 = dl("z2", "Analízis 2 ZH2", "2026-12-10T10:00:00Z");
  const pot = dl("p", "Analízis 2 pótZH", "2026-12-20T10:00:00Z");
  const other = dl("o", "Konzultáció", "2026-11-20T10:00:00Z");
  const all = [second, first, z1, z2, pot, other];
  const links = defaultDeadlineLinks([b1, b2, zh1, zh2, theory], new Set(), "c", all, SINCE);
  assert.deepEqual(links, { beadando1: ident(first), beadando2: ident(second), zh1: ident(z1), zh2: ident(z2) });

  // Without numbers: in due order when the counts match, nothing when they do not.
  const x = dl("x", "Beadandó", "2026-10-01T10:00:00Z");
  const y = dl("y", "Beadandó (javított határidő nélkül)", "2026-11-01T10:00:00Z");
  assert.deepEqual(defaultDeadlineLinks([b1, b2], new Set(), "c", [y, x], SINCE), { beadando1: ident(x), beadando2: ident(y) });
  assert.deepEqual(defaultDeadlineLinks([b1, b2], new Set(), "c", [x], SINCE), {});
  // A single "Zh" takes the only zh deadline; another course's deadlines are not looked at.
  assert.deepEqual(defaultDeadlineLinks([exam("zh", "Zh")], new Set(), "c", [z1, { ...z2, courseId: "d" }], SINCE), { zh: ident(z1) });
  // Components the rules already had keep what the user chose.
  assert.deepEqual(defaultDeadlineLinks([b1, b2], new Set(["beadando1", "beadando2"]), "c", all, SINCE), {});

  // A quiz series takes the quiz deadlines when there are exactly as many.
  const quizzes = { id: "kviz", label: "Kvízek", kind: "series" as const, item: "quiz" as const, count: 2, scoring: { kind: "percent" as const, passAt: 50, onTimeOnly: true } };
  assert.deepEqual(defaultDeadlineLinks([quizzes], new Set(), "c", [quiz2, quiz1], SINCE), {
    kviz: { mode: "deadlines", identities: [deadlineIdentity(quiz1), deadlineIdentity(quiz2)], since: SINCE },
  });
  assert.deepEqual(defaultDeadlineLinks([{ ...quizzes, count: 3 }], new Set(), "c", [quiz1, quiz2], SINCE), {});
});

test("auto links: later data links what it makes clear, a decided component is never touched again", () => {
  const ropzh = { id: "ropzh", label: "Röpzh-k", kind: "series" as const, item: "ropzh" as const, count: 3, scoring: { kind: "points" as const, max: 2 } };
  const b1 = { id: "beadando1", label: "1. beadandó", kind: "assignment" as const, outcomes: [{ id: "ok", label: "Elfogadva", points: 3, accepted: true }] };
  const rules = { courseId: "c", components: [ropzh, b1] };
  const hw = makeDeadline({ id: "hw", courseId: "c", title: "Beadandó 1", due: "2026-10-20T10:00:00Z", source: "ical", feedId: "f", externalUid: "hw" });
  // Rules saved before the timetable and the feed: nothing to link yet.
  assert.deepEqual(autoLinks(rules, [], [], [], SINCE), {});
  // The timetable arrives: the röpzh is linked; the feed arrives: the assignment too.
  assert.deepEqual(Object.keys(autoLinks(rules, sessions, [], [], SINCE)), ["ropzh"]);
  assert.deepEqual(Object.keys(autoLinks(rules, sessions, [hw], [], SINCE)).sort(), ["beadando1", "ropzh"]);
  // Röpzh results already entered by number: a link would move them aside, so no link.
  assert.deepEqual(Object.keys(autoLinks(rules, sessions, [hw], [rec("ropzh", "n:1")], SINCE)), ["beadando1"]);
  // Linked already, or decided by the user (a removed link): left alone.
  assert.deepEqual(autoLinks({ ...rules, calendarLinks: { ropzh: { mode: "weeks", weeks: [3] } }, autoLinked: ["beadando1"] }, sessions, [hw], [], SINCE), {});
});

test("the semester start is proposed from the whole export, an earlier semester left out", () => {
  assert.equal(proposeSemesterStartAt(parsed, new Date("2026-10-07T12:00:00Z")), "2026-09-07");
  // Before the term: the first upcoming class.
  assert.equal(proposeSemesterStartAt(parsed, new Date("2026-08-20T12:00:00Z")), "2026-09-07");
  // A spring class long before is another semester.
  const spring = { kind: "ora" as const, start: "2026-03-02T08:00:00Z" };
  assert.equal(proposeSemesterStartAt([spring, ...parsed], new Date("2026-10-07T12:00:00Z")), "2026-09-07");
  assert.equal(proposeSemesterStartAt([], new Date()), null);
});

test("a course's standing: the grade range and the most pressing risk", () => {
  const rules = {
    schemaVersion: 1 as const,
    components: [
      { id: "jelen", label: "Jelenlét", kind: "attendance" as const, limit: { maxAbsences: 3, countExcused: true, onExceed: "none" as const } },
      { id: "zh", label: "Zh", kind: "exam" as const, scale: { kind: "points" as const, max: 100 } },
    ],
    retakes: [],
    derived: [],
    tables: [{ id: "jegy", rows: [{ min: 0, value: 1 }, { min: 50, value: 2 }, { min: 60, value: 3 }, { min: 75, value: 4 }, { min: 90, value: 5 }] }],
    outcomes: [{ id: "gyak", label: "Gyakorlati jegy", kind: "gyakorlat" as const, select: "first" as const, paths: [{ id: "alap", label: "Alap", grade: "table(jegy, zh)" }] }],
    flags: [],
  };
  const absent = (i: number): RequirementResult => rec("jelen", `n:${i}`, { courseId: "c", value: { kind: "attendance", status: "unexcused" } });
  const zh = (points: number): RequirementResult => rec("zh", "n:1", { value: { kind: "points", points } });
  const now = new Date("2026-10-07T12:00:00Z");
  assert.deepEqual(courseStanding(rules, [absent(1)], now), { grade: "1–5", label: "Gyakorlati jegy", final: false, risk: null, danger: false });
  assert.equal(courseStanding(rules, [absent(1), absent(2)], now)!.risk, "Még 1 hiányzás fér bele");
  const full = courseStanding(rules, [absent(1), absent(2), absent(3), zh(80)], now)!;
  assert.deepEqual([full.grade, full.risk, full.danger], ["4", "Több hiányzás nem fér bele", true]);
  assert.equal(courseStanding(rules, [1, 2, 3, 4].map(absent), now)!.risk, "Túllépted a hiányzási határt");
  // In the bell, the severe ones come first and count in the badge.
  const r = buildReminders({ pending: [], awaiting: [], deadlines: [], assessments: [], risks: [{ courseId: "a", text: "x", danger: false }, { courseId: "b", text: "y", danger: true }], now });
  assert.deepEqual([r.risks.map((x) => x.courseId), r.badge], [["b", "a"], 1]);
});
