import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIcs } from "@/lib/ical/parse";
import { cleanCanvasTitle, parseCanvasEvent } from "@/lib/ical/canvas";
import type { CanvasContext } from "@/lib/types";
import { readFixture } from "./fixtures";

const events = parseIcs(readFixture("canvas.ics"));

function contexts(): Map<string, CanvasContext> {
  const map = new Map<string, CanvasContext>();
  for (const event of events) {
    const { context } = parseCanvasEvent(event);
    if (context) map.set(context.key, context);
  }
  return map;
}

test("six contexts are discovered", () => {
  assert.equal(contexts().size, 6);
});

test("Ea/Gy variants share a groupKey (trailing dot ignored)", () => {
  const all = [...contexts().values()];
  const discrete = all.filter((c) => c.baseName.startsWith("Diszkrét matematika I"));
  const algo = all.filter((c) => c.baseName.startsWith("Algoritmusok és adatszerkezetek I"));
  assert.equal(discrete.length, 2);
  assert.equal(algo.length, 2);
  assert.equal(new Set(discrete.map((c) => c.groupKey)).size, 1);
  assert.equal(new Set(algo.map((c) => c.groupKey)).size, 1);
  assert.deepEqual(discrete.map((c) => c.kind).sort(), ["Ea", "Gy"]);
  assert.deepEqual(algo.map((c) => c.kind).sort(), ["Ea", "Gy"]);
  assert.notEqual(discrete[0].groupKey, algo[0].groupKey);
});

test("override events lose both the (…) and the […] part", () => {
  const override = events.find((e) => e.uid === "event-assignment-override-79658");
  assert.ok(override);
  assert.equal(parseCanvasEvent(override).cleanTitle, "Beadandó 01");
  assert.equal(cleanCanvasTitle(override.summary), "Beadandó 01");
});

test("non-Canvas summaries are left alone", () => {
  const info = parseCanvasEvent({ uid: "x", summary: "ZH (A épület)", start: "2026-01-01T00:00:00Z", categories: [] });
  assert.equal(info.context, null);
  assert.equal(info.cleanTitle, "ZH (A épület)");
});
