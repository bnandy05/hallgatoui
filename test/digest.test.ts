import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectDigest,
  digestPeriodKey,
  digestRange,
  normalizeEmail,
  type DigestInput,
} from "@/lib/digest";
import { formatDigestDue, renderDigestEmail } from "@/lib/digestEmail";
import { makeCourse, makeDeadline, makeFeed } from "./helpers";

// Monday 2026-10-05, 06:00 Budapest (CEST, UTC+2).
const NOW = new Date("2026-10-05T04:00:00.000Z");

function input(overrides: Partial<DigestInput> = {}): DigestInput {
  return {
    frequency: "heti",
    courses: [makeCourse("c1", "Diszkrét matematika I")],
    deadlines: [],
    feeds: [],
    ignoredDuplicatePairs: [],
    dedupe: true,
    now: NOW,
    ...overrides,
  };
}

test("digestPeriodKey uses Budapest Monday weeks and calendar months", () => {
  // Sunday 23:30 Budapest is still the previous week, although UTC says the same Sunday.
  const sundayNight = new Date("2026-10-04T21:30:00.000Z");
  assert.equal(digestPeriodKey("heti", sundayNight), "w:20260928");
  assert.equal(digestPeriodKey("heti", NOW), "w:20261005");
  assert.equal(digestPeriodKey("heti", new Date("2026-10-08T10:00:00.000Z")), "w:20261005");
  // 2026-10-31 23:30 UTC is already November 1st in Budapest (CET, UTC+1).
  assert.equal(digestPeriodKey("havi", new Date("2026-10-31T23:30:00.000Z")), "m:202611");
});

test("normalizeEmail trims, lowercases and rejects junk", () => {
  assert.equal(normalizeEmail("  Nev@Example.HU "), "nev@example.hu");
  assert.equal(normalizeEmail("nev@example"), null);
  assert.equal(normalizeEmail("a b@example.hu"), null);
  assert.equal(normalizeEmail("<x>@example.hu"), null);
  assert.equal(normalizeEmail(42), null);
});

test("collectDigest splits overdue and upcoming within the week or month and skips done ones", () => {
  const deadlines = [
    makeDeadline({ id: "old", due: "2026-09-01T10:00:00.000Z" }), // > 14 days ago
    makeDeadline({ id: "late", due: "2026-10-03T10:00:00.000Z", courseId: "c1" }),
    makeDeadline({ id: "soon", due: "2026-10-06T10:00:00.000Z" }), // within 48 h: critical
    makeDeadline({ id: "week", due: "2026-10-10T10:00:00.000Z" }),
    makeDeadline({ id: "far", due: "2026-10-20T10:00:00.000Z" }),
    makeDeadline({ id: "done", due: "2026-10-07T10:00:00.000Z", done: true }),
  ];
  const weekly = collectDigest(input({ deadlines }));
  assert.deepEqual(weekly.overdue.map((i) => i.deadline.id), ["late"]);
  assert.equal(weekly.overdue[0].course?.name, "Diszkrét matematika I");
  assert.deepEqual(weekly.upcoming.map((i) => i.deadline.id), ["soon", "week"]);
  assert.equal(weekly.upcoming[0].critical, true);
  assert.equal(weekly.upcoming[1].critical, false);

  const monthly = collectDigest(input({ frequency: "havi", deadlines }));
  assert.deepEqual(monthly.upcoming.map((i) => i.deadline.id), ["soon", "week", "far"]);
});

test("collectDigest dedupes copies of the same deadline from two feeds", () => {
  const feeds = [makeFeed({ id: "f1", platformId: "canvas" }), makeFeed({ id: "f2", name: "Moodle", platformId: "moodle" })];
  const deadlines = [
    makeDeadline({ id: "a", source: "ical", feedId: "f1", externalUid: "1", courseId: "c1", title: "Házi feladat 3", due: "2026-10-08T21:59:00.000Z" }),
    makeDeadline({ id: "b", source: "ical", feedId: "f2", externalUid: "2", courseId: "c1", title: "Házi feladat 3", due: "2026-10-08T21:59:00.000Z" }),
  ];
  assert.equal(collectDigest(input({ deadlines, feeds })).upcoming.length, 1);
  assert.equal(collectDigest(input({ deadlines, feeds, dedupe: false })).upcoming.length, 2);
});

test("renderDigestEmail escapes titles, drops non-http links and shows changes", () => {
  const deadlines = [
    makeDeadline({
      id: "x",
      title: "<script>alert(1)</script>",
      url: "javascript:alert(1)",
      due: "2026-10-07T21:59:00.000Z",
      previousDue: "2026-10-06T21:59:00.000Z",
      dueChangedAt: "2026-10-05T01:00:00.000Z",
    }),
  ];
  const content = collectDigest(input({ deadlines }));
  const mail = renderDigestEmail({
    frequency: "heti",
    content,
    now: NOW,
    appUrl: "https://app.example.hu",
    unsubscribeUrl: "https://app.example.hu/hirlevel?m=leiratkozas&t=t&k=k",
  });
  assert.ok(!mail.html.includes("<script>"));
  assert.ok(mail.html.includes("&lt;script&gt;"));
  assert.ok(!mail.html.includes("javascript:"));
  assert.ok(mail.html.includes("Módosult"));
  assert.ok(mail.html.includes("&amp;k=k"));
  assert.equal(mail.subject, "Heti összefoglaló: 1 határidő");
  assert.ok(mail.text.includes("korábban: okt. 6. (K) 23:59"));
});

test("digestRange covers this Monday–Sunday or the rest of the calendar month", () => {
  assert.deepEqual(digestRange("heti", NOW), { from: [2026, 10, 5], to: [2026, 10, 11] });
  assert.deepEqual(digestRange("havi", new Date("2026-12-01T05:00:00.000Z")), { from: [2026, 12, 1], to: [2026, 12, 31] });
  // A deadline on Sunday 23:59 is in the week, one on Monday 00:30 is not.
  const deadlines = [
    makeDeadline({ id: "sun", due: "2026-10-11T21:59:00.000Z" }),
    makeDeadline({ id: "mon", due: "2026-10-11T22:30:00.000Z" }),
  ];
  assert.deepEqual(collectDigest(input({ deadlines })).upcoming.map((i) => i.deadline.id), ["sun"]);
});

test("formatDigestDue prints Budapest wall-clock time", () => {
  assert.equal(formatDigestDue(new Date("2026-10-07T21:59:00.000Z")), "okt. 7. (Sze) 23:59");
  assert.equal(formatDigestDue(new Date("2026-12-01T22:59:00.000Z")), "dec. 1. (K) 23:59");
});
