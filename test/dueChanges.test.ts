import { test } from "node:test";
import assert from "node:assert/strict";
import { trackDueChanges } from "@/lib/server/dueChanges";
import { deadlineIdentity } from "@/lib/ical/dedupe";
import { isRecentlyChanged } from "@/lib/radar";
import type { Deadline } from "@/lib/types";
import { makeDeadline } from "./helpers";

const HOUR = 60 * 60 * 1000;
const t0 = new Date("2026-10-05T08:00:00.000Z");
const D0 = "2026-10-12T21:59:00.000Z";
const D1 = "2026-10-14T21:59:00.000Z";

const feedDl = (id: string, due: string, extra: Partial<Deadline> = {}) =>
  makeDeadline({ id, title: "Beadandó", due, source: "ical", feedId: "f1", externalUid: `u-${id}`, ...extra });

test("first request with a stale snapshot invents no change", () => {
  const snapshot = [feedDl("a", D0)];
  // mergeFeedSync would have set a marker here (random server id, different tz handling...).
  const merged = [feedDl("server-id", D0, { externalUid: "u-a", previousDue: D1, dueChangedAt: t0.toISOString() })];
  const { deadlines, record, changed } = trackDueChanges(null, merged, t0, snapshot);
  assert.equal(deadlines[0].previousDue, undefined);
  assert.equal(deadlines[0].dueChangedAt, undefined);
  assert.equal(isRecentlyChanged(deadlines[0], t0), false);
  assert.equal(changed, true, "the baseline must be persisted");
  assert.equal(record[deadlineIdentity(snapshot[0])].due, D0);
});

test("a marker that came from the browser snapshot is kept", () => {
  const changedAt = new Date(t0.getTime() - 5 * HOUR).toISOString();
  const snapshot = [feedDl("a", D1, { previousDue: D0, dueChangedAt: changedAt })];
  const { deadlines } = trackDueChanges(null, [feedDl("b", D1, { externalUid: "u-a" })], t0, snapshot);
  assert.equal(deadlines[0].previousDue, D0);
  assert.equal(deadlines[0].dueChangedAt, changedAt);
});

test("a real move is stamped at that request and survives 47 h, but not 49 h", () => {
  const snapshot = [feedDl("a", D0)]; // the browser never syncs again
  const first = trackDueChanges(null, [feedDl("s1", D0, { externalUid: "u-a" })], t0, snapshot);

  const moveAt = new Date(t0.getTime() + HOUR);
  const moved = trackDueChanges(first.record, [feedDl("s2", D1, { externalUid: "u-a" })], moveAt, snapshot);
  assert.equal(moved.changed, true);
  assert.equal(moved.deadlines[0].previousDue, D0);
  assert.equal(moved.deadlines[0].dueChangedAt, moveAt.toISOString());

  for (const [hours, expected] of [[47, true], [49, false]] as const) {
    const later = new Date(moveAt.getTime() + hours * HOUR);
    const result = trackDueChanges(moved.record, [feedDl(`s${hours}`, D1, { externalUid: "u-a" })], later, snapshot);
    assert.equal(result.changed, false);
    assert.equal(result.deadlines[0].dueChangedAt, moveAt.toISOString(), "changedAt does not slide");
    assert.equal(isRecentlyChanged(result.deadlines[0], later), expected);
  }
});

test("entries of deadlines that are gone are pruned; manual deadlines pass through", () => {
  const a = feedDl("a", D0);
  const first = trackDueChanges(null, [a, feedDl("b", D0)], t0);
  assert.equal(Object.keys(first.record).length, 2);
  const manual = makeDeadline({ id: "m", due: D0 });
  const pruned = trackDueChanges(first.record, [a, manual], t0);
  assert.deepEqual(Object.keys(pruned.record), [deadlineIdentity(a)]);
  assert.equal(pruned.changed, true);
  assert.equal(pruned.deadlines[1], manual);
  assert.equal(trackDueChanges(pruned.record, [a, manual], t0).changed, false);
});
