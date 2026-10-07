import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCalendar, deadlineUid } from "@/lib/ical/export";
import { parseIcs } from "@/lib/ical/parse";
import { isoWeekday, budapestDate } from "@/lib/ical/budapest";
import { isExamTitle, parseView, viewParam } from "@/lib/ical/views";
import type { Deadline } from "@/lib/types";
import { makeCourse, makeDeadline } from "./helpers";

const now = new Date("2026-10-05T08:00:00.000Z"); // Monday
const courses = [makeCourse("c1", "Diszkrét matematika I"), makeCourse("c2", "Programozáselmélet")];

const deadlines: Deadline[] = [
  makeDeadline({ id: "a", courseId: "c1", title: "Beadandó 04", due: "2026-10-05T21:59:00.000Z", critical: true }),
  makeDeadline({
    id: "b", courseId: "c1", title: "ZH 1", due: "2026-10-08T16:00:00.000Z",
    source: "ical", feedId: "feed-1", externalUid: "event-assignment-1", platformId: "canvas",
  }),
  makeDeadline({ id: "c", courseId: "c2", title: "Kvíz", due: "2026-10-14T21:59:00.000Z" }),
  makeDeadline({ id: "d", courseId: "c2", title: "Befejezett", due: "2026-10-06T10:00:00.000Z", done: true }),
];

function summaries(ics: string): string[] {
  return parseIcs(ics).map((e) => e.summary);
}

test("the calendar parses back and lists open deadlines", () => {
  const events = parseIcs(buildCalendar({ courses, deadlines, now }));
  const titles = events.map((e) => e.summary);
  assert.ok(titles.some((t) => t.includes("Beadandó 04")));
  assert.ok(titles.some((t) => t.includes("ZH 1")));
  assert.ok(!titles.some((t) => t.includes("Befejezett")), "done deadlines are left out by default");
});

test("includeDone adds finished deadlines", () => {
  const titles = summaries(buildCalendar({ courses, deadlines, now, options: { includeDone: true } }));
  assert.ok(titles.some((t) => t.includes("Befejezett")));
});

test("iCal UIDs derive from feedId + externalUid, not from the deadline id", () => {
  const feedDeadline = deadlines[1];
  const other = { ...feedDeadline, id: "different-id" };
  assert.equal(deadlineUid(feedDeadline), deadlineUid(other));
  assert.match(deadlineUid(feedDeadline), /^ical-feed-1-[0-9a-f]{16}@hallgatoireteg$/);
  assert.equal(deadlineUid(deadlines[0]), "a@hallgatoireteg");
  const uids = parseIcs(buildCalendar({ courses, deadlines, now })).map((e) => e.uid);
  assert.ok(uids.includes(deadlineUid(feedDeadline)));
  assert.equal(new Set(uids).size, uids.length);
});

test("views filter as documented", () => {
  const titlesFor = (param: string) =>
    summaries(buildCalendar({ courses, deadlines, now, view: parseView(param, courses), options: { weeklySummary: false } }));
  assert.equal(titlesFor("osszes").length, 3);
  assert.equal(titlesFor("kritikus").length, 1);
  assert.ok(titlesFor("kritikus")[0].includes("Beadandó 04"));
  // "ZH 1" and "Kvíz" (accent-stripped "kviz") both look like tests.
  assert.equal(titlesFor("zh").length, 2);
  assert.ok(isExamTitle("Otthoni kvíz 01"));
  assert.equal(titlesFor("targy-c2").length, 1);
  assert.equal(viewParam(parseView("nonsense")), "osszes");
  assert.equal(viewParam(parseView("targy-missing", courses)), "osszes");
});

test("weekly summaries fall on Budapest Mondays", () => {
  const ics = buildCalendar({ courses, deadlines, now });
  const weekly = parseIcs(ics).filter((e) => e.uid.startsWith("week-"));
  assert.ok(weekly.length >= 2);
  for (const event of weekly) {
    assert.equal(isoWeekday(budapestDate(new Date(event.start))), 1);
  }
  // DTSTART is a DATE; parseIcs maps it to 23:59 of that day, so check the raw uid too.
  assert.ok(weekly.some((e) => e.uid.startsWith("week-20261005@")));
  assert.ok(weekly.some((e) => e.uid.startsWith("week-20261012@")));
});

test("a Sunday-night UTC deadline counts to the Budapest Monday week", () => {
  const late = makeDeadline({ id: "late", title: "Éjféli", due: "2026-10-11T22:30:00.000Z" }); // Mon 00:30 CEST
  const ics = buildCalendar({ courses, deadlines: [late], now });
  const uids = parseIcs(ics).map((e) => e.uid);
  assert.ok(uids.some((u) => u.startsWith("week-20261012@")));
  assert.ok(!uids.some((u) => u.startsWith("week-20261005@")));
});

test("no study blocks before critical deadlines (removed)", () => {
  const ics = buildCalendar({ courses, deadlines, now });
  assert.doesNotMatch(ics, /UID:prep-/);
  assert.doesNotMatch(ics, /Készülés/);
});
