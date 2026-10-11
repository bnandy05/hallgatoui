import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSearchItems, deadlineAnchorId } from "@/lib/search";
import { makeCourse, makeDeadline } from "./helpers";

test("a deadline result points at its slip on the course page, or on Határidők without a course", () => {
  const course = makeCourse("c1", "Analízis");
  const deadlines = [
    makeDeadline({ id: "d1", courseId: "c1" }),
    makeDeadline({ id: "d2", courseId: null }),
    makeDeadline({ id: "d3", courseId: "c1", url: "https://example.com/task" }),
  ];
  const items = buildSearchItems({ courses: [course], deadlines, customPlatforms: [], feeds: [] });
  const href = (id: string) => items.find((i) => i.id === `deadline:${id}`)?.href;
  assert.equal(href("d1"), `/targy/c1#${deadlineAnchorId("d1")}`);
  assert.equal(href("d2"), `/radar#${deadlineAnchorId("d2")}`);
  assert.equal(href("d3"), "https://example.com/task");
});
