import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectDigest,
  digestPeriodKey,
  digestRange,
  shouldSendDigest,
  normalizeEmail,
  type DigestInput,
} from "@/lib/digest";
import { formatDigestDue, renderDigestEmail } from "@/lib/digestEmail";
import type { ClassSession } from "@/lib/types";
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

function session(overrides: Partial<ClassSession>): ClassSession {
  return {
    id: "s", sourceId: "src", externalUid: "u", kind: "ora", subject: "Analysis I", subjectKey: "analysis i",
    teachers: [], start: "2026-10-05T06:15:00.000Z", end: "2026-10-05T07:45:00.000Z", courseId: "c1", ...overrides,
  };
}

test("daily digest: Budapest day period, week range that always includes tomorrow", () => {
  assert.equal(digestPeriodKey("napi", NOW), "d:20261005");
  assert.deepEqual(digestRange("napi", NOW), { from: [2026, 10, 5], to: [2026, 10, 11] });
  const sunday = new Date("2026-10-11T04:00:00.000Z");
  assert.deepEqual(digestRange("napi", sunday), { from: [2026, 10, 11], to: [2026, 10, 12] });
});

test("daily digest: today's classes, and only sent when something is due today or tomorrow", () => {
  const classSessions = [
    session({ id: "a", start: "2026-10-05T10:15:00.000Z", end: "2026-10-05T11:45:00.000Z" }),
    session({ id: "b" }),
    session({ id: "tomorrow", start: "2026-10-06T06:15:00.000Z", end: "2026-10-06T07:45:00.000Z" }),
    session({ id: "holiday", kind: "szunnap", start: "2026-10-05T00:00:00.000Z", end: "2026-10-05T00:00:00.000Z" }),
  ];
  const later = [makeDeadline({ id: "fri", due: "2026-10-09T21:59:00.000Z" })];
  const quiet = collectDigest(input({ frequency: "napi", deadlines: later, classSessions }));
  assert.deepEqual(quiet.classesToday.map((c) => c.session.id), ["b", "a"]);
  assert.equal(quiet.classesToday[0].course?.name, "Diszkrét matematika I");
  assert.equal(shouldSendDigest("napi", quiet), false);
  assert.equal(shouldSendDigest("heti", collectDigest(input({ deadlines: later }))), true);

  const tomorrow = [...later, makeDeadline({ id: "tue", due: "2026-10-06T21:59:00.000Z" })];
  const busy = collectDigest(input({ frequency: "napi", deadlines: tomorrow, classSessions }));
  assert.equal(shouldSendDigest("napi", busy), true);
  assert.equal(collectDigest(input({ deadlines: tomorrow, classSessions })).classesToday.length, 0);
});

test("renderDigestEmail daily: date heading, today with time left, tomorrow and the rest of the week", () => {
  const deadlines = [
    makeDeadline({ id: "today", title: "ZH 1", courseId: "c1", due: "2026-10-05T08:00:00.000Z" }),
    makeDeadline({ id: "tue", title: "Kvíz 3", due: "2026-10-06T21:59:00.000Z" }),
    makeDeadline({ id: "fri", title: "Beadandó 03", due: "2026-10-09T21:59:00.000Z" }),
  ];
  const content = collectDigest(input({ frequency: "napi", deadlines, classSessions: [session({})] }));
  const mail = renderDigestEmail({ frequency: "napi", content, now: NOW, appUrl: "https://app.example.hu", unsubscribeUrl: "https://u" });
  assert.equal(mail.subject, "Napi összefoglaló: ma 1 határidő, holnap 1");
  assert.ok(mail.html.includes("Hétfő, okt. 5."));
  assert.ok(mail.html.includes("még 4 óra"));
  assert.ok(mail.html.includes("08:15–09:45"));
  assert.ok(mail.html.includes("Holnap"));
  assert.ok(mail.html.includes("A hét hátralévő része"));
  assert.ok(mail.text.includes("Beadandó 03"));
});

test("Rögzítésre vár: a daily mail goes out for yesterday's unrecorded class, with the popup link", () => {
  const pending = [
    { title: "Programozáselmélet", detail: "okt. 4. (V) 08:00 · 5. hét: jelenlét, röpzh", end: "2026-10-04T08:00:00.000Z" },
    { title: "Programozáselmélet", detail: "szept. 29. (K) 08:00 · 4. hét: jelenlét", end: "2026-09-29T08:00:00.000Z" },
  ];
  const quiet = collectDigest(input({ frequency: "napi", deadlines: [] }));
  assert.equal(shouldSendDigest("napi", quiet), false);
  const withPending = collectDigest(input({ frequency: "napi", deadlines: [], pending }));
  assert.equal(shouldSendDigest("napi", withPending), true);
  // Only older items: no daily mail for them alone (they were in an earlier one).
  const old = collectDigest(input({ frequency: "napi", deadlines: [], pending: pending.slice(1) }));
  assert.equal(shouldSendDigest("napi", old), false);

  const mail = renderDigestEmail({ frequency: "napi", content: withPending, now: NOW, appUrl: "https://app.hu", unsubscribeUrl: "https://app.hu/x" });
  assert.match(mail.subject, /2 rögzítésre vár/);
  assert.match(mail.html, /Rögzítésre vár/);
  assert.match(mail.html, /https:\/\/app\.hu\/\?potlas=1/);
  assert.match(mail.text, /Kitöltés: https:\/\/app\.hu\/\?potlas=1/);
  const weekly = renderDigestEmail({ frequency: "heti", content: collectDigest(input({ awaitingLate: 2 })), now: NOW, appUrl: "https://app.hu", unsubscribeUrl: "https://app.hu/x" });
  assert.match(weekly.html, /Már két hete vársz 2 eredményre/);
});
