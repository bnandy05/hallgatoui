import { test } from "node:test";
import assert from "node:assert/strict";
import { formatEstimate, HEAVY_WEEK_MINUTES, weekWorkload } from "@/lib/radar";
import type { Deadline } from "@/lib/types";

function dl(id: string, due: string, extra: Partial<Deadline> = {}): Deadline {
  return { id, courseId: null, title: id, due, critical: false, done: false, source: "manual", ...extra };
}

test("formatEstimate: minutes, whole and fractional hours, both languages", () => {
  assert.equal(formatEstimate(45, "hu"), "~45 p");
  assert.equal(formatEstimate(120, "hu"), "~2 ó");
  assert.equal(formatEstimate(90, "hu"), "~1,5 ó");
  assert.equal(formatEstimate(45, "en"), "~45 min");
  assert.equal(formatEstimate(120, "en"), "~2 h");
  assert.equal(formatEstimate(90, "en"), "~1.5 h");
});

test("weekWorkload sums open estimated deadlines of the week and counts the rest", () => {
  const monday = new Date("2026-10-19T00:00:00.000Z");
  const list = [
    dl("a", "2026-10-20T10:00:00.000Z", { estimateMinutes: 120 }),
    dl("b", "2026-10-22T10:00:00.000Z", { estimateMinutes: 60 }),
    dl("c", "2026-10-23T10:00:00.000Z"),
    dl("d", "2026-10-23T10:00:00.000Z", { estimateMinutes: 600, done: true }),
    dl("e", "2026-10-26T10:00:00.000Z", { estimateMinutes: 600 }),
  ];
  const w = weekWorkload(list, monday);
  assert.deepEqual(w, { minutes: 180, estimated: 2, unestimated: 1, heavy: false });
});

test("weekWorkload flags a heavy week only above the threshold", () => {
  const monday = new Date("2026-10-19T00:00:00.000Z");
  const at = (m: number) => weekWorkload([dl("a", "2026-10-20T10:00:00.000Z", { estimateMinutes: m })], monday).heavy;
  assert.equal(at(HEAVY_WEEK_MINUTES), false);
  assert.equal(at(HEAVY_WEEK_MINUTES + 1), true);
});
