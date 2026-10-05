import { test } from "node:test";
import assert from "node:assert/strict";
import { expandDueDates, seriesTitles, wasCapped, MAX_SERIES } from "@/lib/recurrence";

const d = (s: string) => new Date(s);

test("once returns just the first date", () => {
  assert.deepEqual(expandDueDates(d("2026-10-07T10:00:00Z"), { kind: "once" }), [d("2026-10-07T10:00:00Z")]);
});

test("dates: first plus extras, sorted and de-duplicated by minute", () => {
  const first = d("2026-10-14T10:00:00Z");
  const out = expandDueDates(first, {
    kind: "dates",
    extra: [d("2026-10-07T10:00:00Z"), d("2026-10-14T10:00:20Z"), d("2026-10-21T10:00:00Z")],
  });
  assert.deepEqual(
    out.map((x) => x.toISOString()),
    ["2026-10-07T10:00:00.000Z", "2026-10-14T10:00:00.000Z", "2026-10-21T10:00:00.000Z"]
  );
});

test("every week with a count includes the first", () => {
  const out = expandDueDates(d("2026-10-07T10:00:00Z"), { kind: "every", interval: 1, unit: "week", end: { count: 6 } });
  assert.equal(out.length, 6);
  assert.equal(out[5].toISOString(), "2026-11-11T10:00:00.000Z");
});

test("every 2 days", () => {
  const out = expandDueDates(d("2026-10-07T10:00:00Z"), { kind: "every", interval: 2, unit: "day", end: { count: 3 } });
  assert.deepEqual(out.map((x) => x.getUTCDate()), [7, 9, 11]);
});

test("until is inclusive of the whole day", () => {
  const first = new Date(2026, 9, 7, 10, 0);
  const out = expandDueDates(first, { kind: "every", interval: 1, unit: "week", end: { until: new Date(2026, 9, 21, 0, 0) } });
  assert.equal(out.length, 3); // 7, 14, 21 (the 21st at 10:00 is after midnight but within the day)
  const before = expandDueDates(first, { kind: "every", interval: 1, unit: "week", end: { until: new Date(2026, 9, 20) } });
  assert.equal(before.length, 2);
});

test("series is capped at MAX_SERIES", () => {
  const first = d("2026-10-07T10:00:00Z");
  const spec = { kind: "every", interval: 1, unit: "day", end: { count: 99 } } as const;
  assert.equal(expandDueDates(first, spec).length, MAX_SERIES);
  const until = { kind: "every", interval: 1, unit: "day", end: { until: new Date(2027, 11, 31) } } as const;
  assert.equal(expandDueDates(first, until).length, MAX_SERIES);
  assert.equal(wasCapped(first, until), true);
  assert.equal(wasCapped(first, spec), false);
  const many = { kind: "dates", extra: Array.from({ length: 40 }, (_, i) => new Date(2026, 11, 1 + i)) } as const;
  assert.equal(expandDueDates(first, many).length, MAX_SERIES);
  assert.equal(wasCapped(first, many), true);
});

test("interval and count are clamped", () => {
  const first = d("2026-10-07T10:00:00Z");
  assert.equal(expandDueDates(first, { kind: "every", interval: 0, unit: "day", end: { count: 0 } }).length, 1);
  const out = expandDueDates(first, { kind: "every", interval: 500, unit: "week", end: { count: 2 } });
  assert.equal(out[1].getTime() - out[0].getTime(), 52 * 7 * 86_400_000);
});

test("weekly steps keep the wall-clock time across the DST change (Europe/Budapest)", () => {
  // The suite runs with TZ=UTC, where DST does not exist; Node honours a runtime change of TZ,
  // so the zone is switched for this test only.
  const prev = process.env.TZ;
  process.env.TZ = "Europe/Budapest";
  try {
    const first = new Date(2026, 9, 21, 18, 0); // Wed 21 Oct 18:00; DST ends Sun 25 Oct 2026
    assert.equal(first.getTimezoneOffset(), -120, "sanity: the zone switch took effect");
    const out = expandDueDates(first, { kind: "every", interval: 1, unit: "week", end: { count: 3 } });
    assert.deepEqual(out.map((x) => x.getHours()), [18, 18, 18]);
    assert.equal(out[1].getTimezoneOffset(), -60);
    // 7 days later in absolute time would be 17:00 local, which is what a fixed 7*24h step gives.
    assert.equal(new Date(first.getTime() + 7 * 86_400_000).getHours(), 17);
  } finally {
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = prev;
  }
});

test("seriesTitles numbers from 1 or continues a trailing number", () => {
  assert.deepEqual(seriesTitles("Kvíz", 3), ["Kvíz 1", "Kvíz 2", "Kvíz 3"]);
  assert.deepEqual(seriesTitles("Kvíz 3", 3), ["Kvíz 3", "Kvíz 4", "Kvíz 5"]);
  assert.deepEqual(seriesTitles("Kvíz", 1), ["Kvíz"]);
  assert.deepEqual(seriesTitles("  Kvíz 2 ", 2), ["Kvíz 2", "Kvíz 3"]);
  assert.deepEqual(seriesTitles("7", 2), ["7", "8"]);
});
