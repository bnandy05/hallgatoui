import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIcs } from "@/lib/ical/parse";
import {
  applySubjectMapping,
  isNeptunCalendar,
  mergeTimetableImport,
  nextSessionFor,
  parseNeptunEvent,
  parseNeptunEvents,
  summarizeSubjects,
  timetableCutoff,
  upcomingSessions,
  suggestCourseForSubject,
  unmappedSubjects,
  visibleSessions,
} from "@/lib/ical/neptun";
import { buildCalendar, sessionUid } from "@/lib/ical/export";
import { budapestDate, budapestParts, dateKey } from "@/lib/ical/budapest";
import { bucketSessionsByDay } from "@/lib/radar";
import { parseView, viewParam } from "@/lib/ical/views";
import type { TimetableSource } from "@/lib/types";
import { readFixture } from "./fixtures";
import { makeCourse } from "./helpers";

const text = readFixture("neptun-orarend.ics");
const events = parseIcs(text);
const parsed = parseNeptunEvents(events);

test("144 classes and 5 holidays", () => {
  assert.equal(parsed.filter((s) => s.kind === "ora").length, 144);
  assert.equal(parsed.filter((s) => s.kind === "szunnap").length, 5);
  assert.equal(parsed.length, 149);
});

test("6 distinct subjects in 11 subject+group variants", () => {
  // The brief says "10 distinct subjects"; the fixture has 6 subjects and 11 subject/group pairs.
  assert.equal(summarizeSubjects(parsed).length, 6);
  const variants = new Set(parsed.filter((s) => s.kind === "ora").map((s) => `${s.subject}|${s.group}`));
  assert.equal(variants.size, 11);
  const groupsOf = (subject: string) =>
    summarizeSubjects(parsed).find((s) => s.subject === subject)?.groups;
  assert.deepEqual(groupsOf("Event-driven Programming"), ["11", "90"]); // two groups
  assert.deepEqual(groupsOf("Programming theory"), ["1", "6"]);
});

test("Analysis I group 1 on 2026-09-07 runs 10:00-12:00 Budapest, teachers split on ;", () => {
  const s = parsed.find((p) => p.subject === "Analysis I" && p.group === "1" && p.start === "2026-09-07T08:00:00.000Z")!;
  assert.ok(s);
  assert.equal(s.end, "2026-09-07T10:00:00.000Z");
  assert.deepEqual(budapestParts(new Date(s.start)), { date: [2026, 9, 7], hour: 10, minute: 0 });
  assert.deepEqual(budapestParts(new Date(s.end)), { date: [2026, 9, 7], hour: 12, minute: 0 });
  assert.deepEqual(s.teachers, ["Weisz Ferenc Dr.", "Toledo Rodolfo Calixto Dr."]);
  assert.equal(s.room, "LD-0-822-01-11");
  assert.match(s.location ?? "", /Mogyoródi József terem/);
});

test("Mindenszentek is on Budapest 2026-11-01 and is zero-length", () => {
  const h = parsed.find((s) => s.kind === "szunnap" && s.subject === "Mindenszentek")!;
  assert.equal(dateKey(budapestDate(new Date(h.start))), "20261101");
  assert.equal(h.start, h.end);
});

test("tolerant parsing and Hungarian types", () => {
  const base = { uid: "u", start: "2026-09-07T08:00:00.000Z", categories: [] };
  const odd = parseNeptunEvent({ ...base, summary: "Something unexpected" });
  assert.equal(odd.kind, "egyeb");
  assert.equal(odd.subject, "Something unexpected");
  assert.equal(parseNeptunEvent({ ...base, summary: "Analízis ( - 2) - Kiss Pál - Vizsga" }).kind, "vizsga");
  assert.equal(parseNeptunEvent({ ...base, summary: "Analízis ( - 2) - Kiss Pál - Tanóra" }).kind, "ora");
  assert.equal(parseNeptunEvent({ ...base, summary: "Valami ( - x) - Egyéb esemény" }).kind, "egyeb");
});

test("isNeptunCalendar recognises the export and rejects Canvas", () => {
  assert.equal(isNeptunCalendar(events, text), true);
  assert.equal(isNeptunCalendar(events), true);
  assert.equal(isNeptunCalendar(parseIcs(readFixture("canvas.ics"))), false);
});

const source: TimetableSource = {
  id: "src1", name: "Neptun órarend", importedAt: "2026-10-03T00:00:00.000Z", subjectCourses: {},
};

test("mapping, re-import keeps ids and mapping, other sources untouched", () => {
  const analysis = makeCourse("c-an", "Analízis I");
  assert.equal(suggestCourseForSubject("Analízis I", [analysis]), "c-an");
  assert.equal(suggestCourseForSubject("Analysis I", [analysis]), null);

  const mapped = { ...source, subjectCourses: { "analysis i": "c-an", "programming theory": null } };
  const otherSource = { ...parsed[0], id: "x", sourceId: "other", courseId: null };
  const first = mergeTimetableImport(mapped, parsed, [otherSource]);
  assert.equal(first.length, 150);
  assert.equal(first.find((s) => s.sourceId === "other")?.id, "x");
  assert.ok(first.filter((s) => s.subject === "Analysis I").every((s) => s.courseId === "c-an"));
  assert.ok(first.filter((s) => s.subject === "Programming theory").every((s) => s.courseId === null));

  const again = mergeTimetableImport(mapped, parsed.slice(0, 50), first);
  assert.equal(again.filter((s) => s.sourceId === "src1").length, 50);
  assert.equal(again.length, 51);
  const before = first.find((s) => s.externalUid === parsed[10].externalUid);
  assert.equal(again.find((s) => s.externalUid === parsed[10].externalUid)?.id, before?.id);

  // Unmapped subjects are the ones without any entry in subjectCourses.
  assert.equal(unmappedSubjects(first, [mapped]).length, 4);
  const remapped = applySubjectMapping({ ...mapped, subjectCourses: { ...mapped.subjectCourses, "programming theory": "c-an" } }, first);
  assert.ok(remapped.filter((s) => s.subject === "Programming theory").every((s) => s.courseId === "c-an"));
});

test("nextSessionFor and day bucketing", () => {
  const sessions = mergeTimetableImport({ ...source, subjectCourses: { "analysis i": "c-an" } }, parsed, []);
  const next = nextSessionFor("c-an", sessions, new Date("2026-09-07T09:00:00.000Z"));
  assert.ok(next && next.end >= "2026-09-07T09:00:00.000Z" && next.courseId === "c-an");
  assert.equal(nextSessionFor("nope", sessions, new Date("2026-09-01T00:00:00Z")), undefined);

  // TZ=UTC in the test runner: the week is Mon 2026-10-19 00:00 UTC (there are no classes the
  // week after, an autumn break). The 1956 holiday is Fri 23 Oct 00:00 Budapest = 22:00Z Thu.
  const week = bucketSessionsByDay(sessions, new Date("2026-10-19T00:00:00.000Z"));
  assert.equal(week.length, 7);
  assert.ok(week.some((d) => d.sessions.length > 0));
  assert.equal(week.filter((d) => d.holiday).length, 1);
  assert.ok(week.every((d) => d.sessions.every((s) => s.kind !== "szunnap")));
});

test("buildCalendar: orarend view and includeClasses", () => {
  const course = makeCourse("c-an", "Analízis I");
  const sessions = mergeTimetableImport({ ...source, subjectCourses: { "analysis i": "c-an" } }, parsed, []);
  const now = new Date("2026-10-05T08:00:00.000Z");
  assert.equal(viewParam(parseView("orarend")), "orarend");
  assert.equal(viewParam(parseView("nonsense")), "osszes");

  const timetable = buildCalendar({ courses: [course], deadlines: [], classSessions: sessions, now, view: parseView("orarend") });
  assert.match(timetable, /X-WR-CALNAME:Hallgatói réteg – Órarend/);
  const veventCount = (ics: string) => (ics.match(/BEGIN:VEVENT/g) ?? []).length;
  assert.equal(veventCount(timetable), 149);
  assert.match(timetable, /LOCATION:Lágymányos/);
  assert.match(timetable.replace(/\r\n /g, ""), /Oktató: Weisz Ferenc Dr\.\\, Toledo/);
  assert.match(timetable, /DTSTART:20260907T080000Z/);
  // Holidays are all-day and transparent, on the Budapest date.
  assert.match(timetable, /DTSTART;VALUE=DATE:20261101/);
  assert.match(timetable, /TRANSP:TRANSPARENT/);
  assert.match(timetable, new RegExp(`UID:${sessionUid(sessions[0]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

  const deadlines = [{ id: "d", courseId: "c-an", title: "ZH", due: "2026-10-08T10:00:00.000Z", critical: false, done: false, source: "manual" as const }];
  const base = { courses: [course], deadlines, classSessions: sessions, now, options: { weeklySummary: false, studyBlocks: false } };
  assert.equal(veventCount(buildCalendar(base)), 1, "classes are off by default");
  const withClasses = buildCalendar({ ...base, options: { ...base.options, includeClasses: true } });
  assert.equal(veventCount(withClasses), 1 + 149);
  const courseView = buildCalendar({ ...base, options: { ...base.options, includeClasses: true }, view: parseView("targy-c-an", [course]) });
  const analysisCount = sessions.filter((s) => s.courseId === "c-an").length;
  assert.equal(veventCount(courseView), 1 + analysisCount);
});

test("skipped subjects (mapping null) are hidden, unmapped ones stay, holidays stay", () => {
  const mapped = { ...source, subjectCourses: { "analysis i": "c-an", "programming theory": null } };
  const sessions = mergeTimetableImport(mapped, parsed, []);
  const visible = visibleSessions(sessions, [mapped]);
  assert.ok(!visible.some((s) => s.subject === "Programming theory"));
  assert.ok(visible.some((s) => s.subject === "Analysis I"));
  assert.ok(visible.some((s) => s.subject === "Discrete mathematics I"), "unmapped stays");
  assert.equal(visible.filter((s) => s.kind === "szunnap").length, 5);

  const ics = buildCalendar({
    courses: [makeCourse("c-an", "Analízis I")], deadlines: [], classSessions: visible,
    now: new Date("2026-10-05T08:00:00.000Z"), view: parseView("orarend"),
  });
  assert.ok(!ics.includes("SUMMARY:Programming theory"));
});

test("timetableCutoff is Monday 00:00 Budapest of the current week", () => {
  // Wed 2026-10-07 14:00 UTC; Budapest is on CEST until 2026-10-25.
  assert.equal(timetableCutoff(new Date("2026-10-07T14:00:00Z")).toISOString(), "2026-10-04T22:00:00.000Z");
});

test("timetableCutoff uses the Budapest week at the Sunday/Monday edge", () => {
  // Sun 22:30 UTC = Mon 00:30 Budapest: already the new week.
  assert.equal(timetableCutoff(new Date("2026-10-04T22:30:00Z")).toISOString(), "2026-10-04T22:00:00.000Z");
  // Sun 21:30 UTC = Sun 23:30 Budapest: still the old week.
  assert.equal(timetableCutoff(new Date("2026-10-04T21:30:00Z")).toISOString(), "2026-09-27T22:00:00.000Z");
});

test("upcomingSessions drops earlier weeks but keeps the current one", () => {
  const now = new Date("2026-10-07T14:00:00Z");
  const kept = upcomingSessions(parsed, now);
  assert.ok(kept.length > 0 && kept.length < parsed.length);
  const cutoff = timetableCutoff(now).getTime();
  assert.ok(kept.every((s) => new Date(s.end).getTime() >= cutoff));
  assert.ok(parsed.filter((s) => !kept.includes(s)).every((s) => new Date(s.end).getTime() < cutoff));
});

test("a past semester is dropped and its subjects are not asked about", () => {
  const YEAR = 365 * 24 * 60 * 60 * 1000;
  const past = parsed.map((s) => ({
    ...s,
    start: new Date(new Date(s.start).getTime() - YEAR).toISOString(),
    end: new Date(new Date(s.end).getTime() - YEAR).toISOString(),
  }));
  const now = new Date("2026-10-07T14:00:00Z");
  assert.equal(upcomingSessions(past, now).length, 0);
  assert.equal(summarizeSubjects(upcomingSessions(past, now)).length, 0);
});
