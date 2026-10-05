import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIcs } from "@/lib/ical/parse";
import { mergeFeedSync, rematchDeadlines } from "@/lib/ical/sync";
import { isRecentlyChanged } from "@/lib/radar";
import type { Deadline } from "@/lib/types";
import { readFixture } from "./fixtures";
import { makeCourse, makeFeed } from "./helpers";

const events = parseIcs(readFixture("canvas.ics"));
const now = new Date("2026-09-20T10:00:00.000Z");
const courses = [makeCourse("c-dm", "Diszkrét matematika I", ["IP-18DM1E", "K8VOV1-DM1gy2026osz"])];
const feed = makeFeed();

function sync(deadlines: Deadline[], evs = events, f = feed, at = now) {
  return mergeFeedSync({ feed: f, events: evs, deadlines, courses, now: at });
}

test("first sync creates deadlines for events within the 30 day window", () => {
  const { deadlines, discovered } = sync([]);
  assert.equal(deadlines.length, events.length); // all fixture events are within 30 days of `now`
  assert.equal(discovered.length, 6);
  assert.ok(deadlines.every((d) => d.source === "ical" && d.feedId === feed.id && d.externalUid));
});

test("re-sync keeps done / critical / courseId", () => {
  const first = sync([]).deadlines;
  const target = first.find((d) => d.externalUid === "event-assignment-512897")!;
  const edited = first.map((d) =>
    d.id === target.id ? { ...d, done: true, critical: true, courseId: "c-manual" } : d
  );
  const again = sync(edited).deadlines;
  const kept = again.find((d) => d.externalUid === "event-assignment-512897")!;
  assert.equal(kept.id, target.id);
  assert.equal(kept.done, true);
  assert.equal(kept.critical, true);
  assert.equal(kept.courseId, "c-manual");
  assert.equal(again.length, first.length);
  assert.equal(again.find((d) => d.previousDue), undefined, "no false due change");
});

test("a moved due date sets previousDue and dueChangedAt", () => {
  const first = sync([]).deadlines;
  const moved = events.map((e) =>
    e.uid === "event-assignment-512897" ? { ...e, start: "2026-09-20T21:59:00.000Z" } : e
  );
  const later = new Date("2026-09-21T08:00:00.000Z");
  const again = sync(first, moved, feed, later).deadlines;
  const d = again.find((x) => x.externalUid === "event-assignment-512897")!;
  assert.equal(d.previousDue, "2026-09-13T21:59:00.000Z");
  assert.equal(d.due, "2026-09-20T21:59:00.000Z");
  assert.equal(d.dueChangedAt, later.toISOString());
  assert.equal(isRecentlyChanged(d, later), true);
});

test("future events missing from the feed are dropped, past ones are kept", () => {
  const first = sync([]).deadlines;
  const pastUid = "event-assignment-512897"; // 2026-09-13, before `now`
  const futureUid = "event-assignment-override-80509"; // 2026-10-05, after `now`
  const reduced = events.filter((e) => e.uid !== pastUid && e.uid !== futureUid);
  const again = sync(first, reduced).deadlines;
  assert.ok(again.some((d) => d.externalUid === pastUid));
  assert.ok(!again.some((d) => d.externalUid === futureUid));
});

test("markDoneBefore marks only newly created, already-past deadlines as done", () => {
  const f = makeFeed({ markDoneBefore: now.toISOString() });
  const { deadlines } = sync([], events, f);
  const past = deadlines.find((d) => d.externalUid === "event-assignment-512897")!;
  const future = deadlines.find((d) => d.externalUid === "event-assignment-override-80509")!;
  assert.equal(past.done, true);
  assert.equal(future.done, false);
});

test("deadlines of other feeds and manual ones are untouched", () => {
  const manual: Deadline = {
    id: "m1", courseId: null, title: "Mine", due: "2026-10-01T10:00:00.000Z",
    critical: false, done: false, source: "manual",
  };
  const { deadlines } = sync([manual]);
  assert.deepEqual(deadlines.find((d) => d.id === "m1"), manual);
});

test("rematch assigns deadlines synced before their course existed (Canvas before Neptun)", () => {
  const before = mergeFeedSync({ feed, events, deadlines: [], courses: [], now }).deadlines;
  assert.ok(before.every((d) => d.courseId === null));

  // A timetable import later creates the course with the subject name as keyword.
  const later = [makeCourse("c-dm", "Diszkrét matematika I", ["Diszkrét matematika I"])];
  const after = rematchDeadlines(before, [feed], later);
  const quiz = after.find((d) => d.title.startsWith("Otthoni kvíz 01"))!;
  assert.equal(quiz.courseId, "c-dm");
  assert.equal(quiz.title, "Otthoni kvíz 01");

  const fixed = rematchDeadlines(before, [makeFeed({ courseId: "c-other" })], later);
  assert.ok(fixed.every((d) => d.courseId === null), "feeds with a fixed course are left alone");
});
