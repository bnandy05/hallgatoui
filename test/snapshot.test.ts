import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSnapshot } from "@/lib/server/subscription";

const base = { courses: [], deadlines: [], feeds: [], customPlatforms: [] };

test("validateSnapshot defaults dedupe on and ignoredDuplicatePairs to []", () => {
  const snapshot = validateSnapshot({ ...base, options: {} });
  assert.equal(snapshot?.options.dedupe, true);
  assert.deepEqual(snapshot?.ignoredDuplicatePairs, []);
});

test("validateSnapshot keeps dedupe:false and caps/filters the ignored pairs", () => {
  const pairs = Array.from({ length: 2500 }, (_, i) => `a${i}|b${i}`);
  const snapshot = validateSnapshot({
    ...base,
    options: { dedupe: false },
    ignoredDuplicatePairs: [...pairs, 42, null],
  });
  assert.equal(snapshot?.options.dedupe, false);
  assert.equal(snapshot?.ignoredDuplicatePairs.length, 2000);
  assert.ok(snapshot?.ignoredDuplicatePairs.every((p) => typeof p === "string"));
});
