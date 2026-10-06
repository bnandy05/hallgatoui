import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReminders } from "@/lib/reminders";
import { makeDeadline } from "./helpers";

test("reminders: overdue first, then critical, then soon; old overdue left out", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const overdue = makeDeadline({ id: "o", title: "Lejárt", due: "2026-10-06T10:00:00.000Z" });
  const ancient = makeDeadline({ id: "a", title: "Régi", due: "2026-08-01T10:00:00.000Z" });
  const soon = makeDeadline({ id: "s", title: "Jövő hét", due: "2026-10-12T10:00:00.000Z" });
  const critical = makeDeadline({ id: "k", title: "Holnap", due: "2026-10-08T10:00:00.000Z" });
  const done = makeDeadline({ id: "d", title: "Kész", due: "2026-10-08T10:00:00.000Z", done: true });
  const r = buildReminders({ deadlines: [soon, overdue, ancient, critical, done], now });
  assert.deepEqual(r.deadlines.map((d) => d.id), ["o", "k", "s"]);
  assert.equal(r.badge, 2);
});
