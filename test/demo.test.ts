import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemoData, buildShowcaseData } from "@/lib/demo";
import { isDemoFeedId } from "@/lib/demoMode";
import { findDuplicates } from "@/lib/ical/dedupe";
import { visibleSessions } from "@/lib/ical/neptun";

const NOW = new Date("2026-10-14T09:00:00Z"); // a Wednesday

for (const locale of ["hu", "en"] as const) {
  test(`showcase data (${locale}): unique ids, everything linked to a course`, () => {
    const data = buildShowcaseData(NOW, locale);
    const ids = [...data.courses, ...data.deadlines, ...data.classSessions].map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
    const courseIds = new Set(data.courses.map((c) => c.id));
    for (const d of data.deadlines) assert.ok(d.courseId && courseIds.has(d.courseId), d.id);
    for (const s of data.classSessions) assert.ok(s.courseId && courseIds.has(s.courseId), s.id);
    for (const d of data.deadlines.filter((x) => x.source === "ical")) assert.equal(d.feedId, data.feeds[0].id);
  });

  test(`showcase data (${locale}): the Canvas quiz duplicates the manual one`, () => {
    const data = buildShowcaseData(NOW, locale);
    const groups = findDuplicates(data.deadlines, data.feeds, [], data.courses);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].primary.id, "demo-dl-4");
    assert.deepEqual(groups[0].others.map((d) => d.id), ["demo-ical-quiz-3"]);
  });
}

test("showcase data: every class is visible and the feed is never fetched", () => {
  const data = buildShowcaseData(NOW);
  assert.equal(visibleSessions(data.classSessions, data.timetableSources).length, data.classSessions.length);
  assert.ok(data.feeds.every((f) => isDemoFeedId(f.id)));
});

test("sample data for an account has no feed or timetable", () => {
  const data = buildDemoData(NOW);
  assert.equal(data.feeds.length, 0);
  assert.equal(data.classSessions.length, 0);
  assert.ok(data.deadlines.every((d) => d.source === "manual"));
});
