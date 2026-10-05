import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIcs } from "@/lib/ical/parse";
import { mergeFeedSync } from "@/lib/ical/sync";
import { autoLinkContexts } from "@/lib/ical/discover";
import type { Course, IcalFeed } from "@/lib/types";
import { readFixture } from "./fixtures";
import { makeCourse, makeFeed } from "./helpers";

const NOW = new Date("2026-09-20T10:00:00.000Z");

/** The Canvas fixture synced into a feed, so `discovered` is filled as in the app. */
function syncedFeed(overrides: Partial<IcalFeed> = {}): IcalFeed {
  const feed = makeFeed({ id: "f1", courseId: null, ...overrides });
  const events = parseIcs(readFixture("canvas.ics"));
  const { discovered } = mergeFeedSync({ feed, events, deadlines: [], courses: [], now: NOW });
  return { ...feed, discovered };
}

const canvasUrls = (course: Course) => course.links.filter((l) => l.platformId === "canvas").map((l) => l.url);

test("autoLinkContexts adds the Canvas course links to courses matched by keyword (Neptun mapping)", () => {
  const dm = makeCourse("dm", "Diszkrét matematika I", ["Diszkrét matematika I"]);
  const other = makeCourse("x", "Analízis", ["Analízis"]);
  const { courses, linked } = autoLinkContexts([dm, other], syncedFeed());

  assert.deepEqual(canvasUrls(courses[0]).sort(), [
    "https://canvas.elte.hu/courses/66066",
    "https://canvas.elte.hu/courses/66092",
  ]);
  // Two Canvas links on one course: labelled by kind.
  assert.deepEqual(courses[0].links.map((l) => l.label).sort(), ["Előadás", "Gyakorlat"]);
  assert.equal(courses[1], other, "an unmatched course is untouched");
  assert.equal(linked.length, 2);
});

test("autoLinkContexts leaves a single Canvas link unlabelled", () => {
  const ml = makeCourse("ml", "Gépi tanulás", ["gépi tanulásba"]);
  const { courses } = autoLinkContexts([ml], syncedFeed());
  assert.deepEqual(canvasUrls(courses[0]), ["https://canvas.elte.hu/courses/66716"]);
  assert.equal(courses[0].links[0].label, undefined);
});

test("autoLinkContexts uses the feed's fixed course for every context", () => {
  const fixed = makeCourse("fixed", "Minden", []);
  const { courses, linked } = autoLinkContexts([fixed], syncedFeed({ courseId: "fixed" }));
  assert.equal(canvasUrls(courses[0]).length, 6);
  assert.equal(linked.length, 6);
});

test("autoLinkContexts never adds a link twice and skips linked or ignored contexts", () => {
  const dm = makeCourse("dm", "Diszkrét matematika I", ["Diszkrét matematika I"]);
  const feed = syncedFeed();
  const first = autoLinkContexts([dm], feed);

  // Same sync again: the link is already there.
  const again = autoLinkContexts(first.courses, feed);
  assert.equal(canvasUrls(again.courses[0]).length, 2);

  // The user deleted the links: remembered contexts don't come back.
  const deleted = { ...first.courses[0], links: [] };
  const remembered = autoLinkContexts([deleted], { ...feed, linkedContexts: first.linked });
  assert.deepEqual(remembered.courses[0].links, []);
  assert.deepEqual(remembered.linked, []);

  // Skipped in the discovery dialog: never linked.
  const ignored = autoLinkContexts([dm], { ...feed, ignoredContexts: first.linked });
  assert.deepEqual(ignored.courses[0].links, []);
});

test("autoLinkContexts records an existing identical link as linked without duplicating it", () => {
  const dm = {
    ...makeCourse("dm", "Diszkrét matematika I", ["Diszkrét matematika I"]),
    links: [{ id: "l1", platformId: "canvas", url: "https://canvas.elte.hu/courses/66066" }],
  };
  const { courses, linked } = autoLinkContexts([dm], syncedFeed());
  assert.equal(canvasUrls(courses[0]).length, 2);
  assert.equal(linked.length, 2);
});

test("autoLinkContexts returns the same array when nothing changes", () => {
  const courses = [makeCourse("x", "Analízis", ["Analízis"])];
  const result = autoLinkContexts(courses, syncedFeed());
  assert.equal(result.courses, courses);
  assert.deepEqual(result.linked, []);
});
