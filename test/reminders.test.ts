import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReminders } from "@/lib/reminders";
import type { GradeAlert } from "@/lib/gradeAlerts";
import { makeDeadline } from "./helpers";

test("reminders: overdue first, then critical, then soon; old overdue left out", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const overdue = makeDeadline({ id: "o", title: "Lejárt", due: "2026-10-06T10:00:00.000Z" });
  const ancient = makeDeadline({ id: "a", title: "Régi", due: "2026-08-01T10:00:00.000Z" });
  const soon = makeDeadline({ id: "s", title: "Jövő hét", due: "2026-10-12T10:00:00.000Z" });
  const critical = makeDeadline({ id: "k", title: "Holnap", due: "2026-10-08T10:00:00.000Z" });
  const done = makeDeadline({ id: "d", title: "Kész", due: "2026-10-08T10:00:00.000Z", done: true });
  const r = buildReminders({ pending: [], awaiting: [], assessments: [], deadlines: [soon, overdue, ancient, critical, done], now });
  assert.deepEqual(r.deadlines.map((d) => d.id), ["o", "k", "s"]);
  assert.equal(r.badge, 2);
});

test("reminders: alerts sorted danger first, capped at 6, only danger counts in the badge", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const mk = (key: string, severity: "info" | "warning" | "danger"): GradeAlert => ({
    key, kind: "risk", severity, courseId: "c", text: key, urgent: severity === "danger",
  });
  const alerts = [mk("a", "info"), mk("b", "danger"), mk("c", "warning"), mk("d", "info"), mk("e", "info"), mk("f", "info"), mk("g", "info"), mk("h", "danger")];
  const r = buildReminders({ pending: [], awaiting: [], assessments: [], deadlines: [], alerts, now });
  assert.deepEqual(r.alerts.map((a) => a.key), ["b", "h", "c", "a", "d", "e"]);
  assert.equal(r.moreAlerts, 2);
  assert.equal(r.badge, 2);
  const good = buildReminders({ pending: [], awaiting: [], assessments: [], deadlines: [], alerts: [mk("x", "info"), mk("y", "warning")], now });
  assert.equal(good.badge, 0);
});
