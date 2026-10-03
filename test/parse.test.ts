import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIcs } from "@/lib/ical/parse";
import { readFixture } from "./fixtures";

const canvas = parseIcs(readFixture("canvas.ics"));

test("canvas.ics parses to 34 events", () => {
  assert.equal(canvas.length, 34);
  assert.equal(new Set(canvas.map((e) => e.uid)).size, 34);
});

test("a Canvas all-day date is 23:59 Budapest time (CEST) whatever the runtime zone", () => {
  const quiz = canvas.find((e) => e.summary.startsWith("Otthoni kvíz 01"));
  assert.equal(quiz?.start, "2026-09-13T21:59:00.000Z");
});

test("timed Canvas events keep their exact instant", () => {
  const override = canvas.find((e) => e.uid === "event-assignment-override-79658");
  assert.equal(override?.start, "2026-09-14T18:00:00.000Z");
});

test("neptun-orarend.ics parses to 149 events despite blank lines", () => {
  assert.equal(parseIcs(readFixture("neptun-orarend.ics")).length, 149);
});

test("a winter all-day event is 23:59 CET (22:59Z)", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:winter-1",
    "DTSTART;VALUE=DATE:20261215T000000",
    "SUMMARY:Téli beadandó",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:winter-2",
    "DTSTART;VALUE=DATE:20261215",
    "SUMMARY:Plain date",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const events = parseIcs(ics);
  assert.deepEqual(
    events.map((e) => e.start),
    ["2026-12-15T22:59:00.000Z", "2026-12-15T22:59:00.000Z"]
  );
});
