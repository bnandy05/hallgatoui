import { test } from "node:test";
import assert from "node:assert/strict";
import { budapestInstant, budapestParts } from "@/lib/ical/budapest";

test("budapestInstant handles summer and winter time", () => {
  assert.equal(budapestInstant([2026, 9, 13], 23, 59).toISOString(), "2026-09-13T21:59:00.000Z");
  assert.equal(budapestInstant([2026, 12, 15], 23, 59).toISOString(), "2026-12-15T22:59:00.000Z");
});

test("budapestInstant round-trips around the DST switches", () => {
  // 2026: CET -> CEST on 29 March, CEST -> CET on 25 October.
  for (const [date, hour] of [
    [[2026, 3, 29], 0],
    [[2026, 3, 29], 4],
    [[2026, 10, 25], 1],
    [[2026, 10, 25], 3],
    [[2026, 10, 26], 0],
  ] as const) {
    const parts = budapestParts(budapestInstant([...date], hour, 30));
    assert.deepEqual(parts, { date: [...date], hour, minute: 30 });
  }
});
