import { test } from "node:test";
import assert from "node:assert/strict";
import { borderlinePairs, confirmedPairKey, findDuplicates, pairKey, userExceptions } from "@/lib/ical/dedupe";
import { guessCourse, nameSimilarity, nameTokens } from "@/lib/suggest/courseMatch";
import { courseQuestion, duplicateQuestion } from "@/lib/suggest/questions";
import { questionCacheKey, suggestWithJev, SUGGEST_DAILY_LIMIT } from "@/lib/server/jevSuggest";
import { createMemoryKv } from "@/lib/server/kv";
import type { Deadline } from "@/lib/types";
import { makeCourse, makeDeadline, makeFeed } from "./helpers";

// ---- course guesses ----

const dimat = { ...makeCourse("dm", "Diszkrét matematika I"), code: "IP-18DM1E" };
const an1 = makeCourse("an1", "Analízis I");
const an2 = makeCourse("an2", "Analízis II");
const prog = makeCourse("pr", "Programozás", ["PROG"]);
const courses = [dimat, an1, an2, prog];

test("an equal name (accents, dots, Ea/Gy suffix ignored) is settled locally", () => {
  assert.deepEqual(guessCourse("Diszkret matematika I. Ea", courses), { courseId: "dm", via: "exact" });
  assert.deepEqual(guessCourse("Analízis II gyakorlat", courses), { courseId: "an2", via: "exact" });
});

test("a keyword or course code is settled locally", () => {
  assert.deepEqual(guessCourse("IP-18DM1E 1 Diszkrét", courses), { courseId: "dm", via: "keyword" });
  assert.deepEqual(guessCourse("PROG beadandók", courses), { courseId: "pr", via: "keyword" });
});

test("different numbers are never the same course, and an English name goes to Jev", () => {
  assert.equal(nameSimilarity(nameTokens("Analízis I"), nameTokens("Analízis II")), 0);
  assert.deepEqual(guessCourse("Analízis III", courses), { ask: true });
  assert.deepEqual(guessCourse("Discrete mathematics I", courses), { ask: true });
});

test("one clearly closest name is settled locally, a tie is asked", () => {
  const many = [makeCourse("a", "Programozási nyelvek elmélete"), makeCourse("b", "Webfejlesztés")];
  assert.deepEqual(guessCourse("Programozási nyelvek elmélete (Java)", many), { courseId: "a", via: "similar" });
  assert.deepEqual(guessCourse("Bevezetés a számításelméletbe", [makeCourse("s", "Bevezetés számításelméletbe")]), {
    courseId: "s",
    via: "exact",
  });
  assert.deepEqual(guessCourse("Analízis", [an1, an2]), { ask: true });
  assert.equal(guessCourse("Bármi", []), null);
});

// ---- borderline duplicates ----

const canvas = makeFeed({ id: "f-cv", platformId: "canvas" });
const neptun = makeFeed({ id: "f-np", platformId: "neptun" });
const DAY = "2026-10-12T21:59:00.000Z";
const feedDl = (id: string, feed: { id: string; platformId: string }, title: string, extra: Partial<Deadline> = {}) =>
  makeDeadline({ id, title, due: DAY, courseId: "dm", source: "ical", feedId: feed.id, externalUid: `u-${id}`, platformId: feed.platformId, ...extra });

test("similar titles merge without asking; only the unclear pairs are borderline", () => {
  const same = [feedDl("a", canvas, "Beadandó 01"), feedDl("b", neptun, "Beadandó 1")];
  assert.equal(findDuplicates(same, [], [], courses).length, 1);
  assert.deepEqual(borderlinePairs(same, [], courses), []);

  const unclear = [feedDl("c", canvas, "ZH1"), feedDl("d", neptun, "1. zárthelyi dolgozat")];
  assert.equal(findDuplicates(unclear, [], [], courses).length, 0);
  assert.deepEqual(borderlinePairs(unclear, [], courses).map(([x, y]) => [x.id, y.id]), [["c", "d"]]);

  const different = [feedDl("e", canvas, "Beadandó 2"), feedDl("f", neptun, "Beadandó 3")];
  assert.deepEqual(borderlinePairs(different, [], courses), []);
  const unrelated = [feedDl("g", canvas, "Konzultáció"), feedDl("h", neptun, "Kvíz")];
  assert.deepEqual(borderlinePairs(unrelated, [], courses), []);
  const bothDone = [feedDl("i", canvas, "ZH1", { done: true }), feedDl("j", neptun, "1. zárthelyi", { done: true })];
  assert.deepEqual(borderlinePairs(bothDone, [], courses), []);
});

test("a confirmation merges a borderline pair, and the user's exception still wins", () => {
  const [c, d] = [feedDl("c", canvas, "ZH1"), feedDl("d", neptun, "1. zárthelyi dolgozat")];
  const confirmed = [confirmedPairKey(c, d)];
  assert.equal(findDuplicates([c, d], [], confirmed, courses).length, 1);
  assert.deepEqual(borderlinePairs([c, d], confirmed, courses), []);
  assert.equal(findDuplicates([c, d], [], [...confirmed, pairKey(c, d)], courses).length, 0);
  assert.deepEqual(userExceptions([...confirmed, pairKey(c, d)]), [pairKey(c, d)]);
});

// ---- questions and the cached Jev layer ----

test("questions carry no ids, so the same question has the same cache key for everyone", () => {
  const a = courseQuestion("0", "Discrete mathematics I", ["Analízis I", "Diszkrét matematika I"]);
  const b = courseQuestion("7", "Discrete mathematics I", ["Analízis I", "Diszkrét matematika I"]);
  assert.equal(questionCacheKey(a), questionCacheKey(b));
  assert.deepEqual(a.options.map((o) => o.id), ["c0", "c1", "none"]);
  const q = duplicateQuestion("0", { title: "ZH1", source: "canvas", time: "all day" }, { title: "1. zh", source: "neptun", time: "10:00" });
  assert.match(q.quote, /A: "ZH1" \(from canvas, all day\)\nB: "1. zh" \(from neptun, 10:00\)/);
});

function fakeJev(answers: Record<string, { choice: string; confidence: number }>) {
  const calls: string[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push(body.state);
    const answer = Object.entries(answers).find(([needle]) => body.state.includes(needle))?.[1];
    return Response.json({ answers: answer ? { q0: { type: "choice", ...answer } } : {} });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

test("every answer is cached for everyone; only confident ones are returned", async () => {
  const kv = createMemoryKv();
  const jev = fakeJev({ Discrete: { choice: "c1", confidence: 0.93 }, Kalkulus: { choice: "c0", confidence: 0.5 } });
  const qs = [
    courseQuestion("0", "Discrete mathematics I", ["Analízis I", "Diszkrét matematika I"]),
    courseQuestion("1", "Kalkulus", ["Analízis I", "Diszkrét matematika I"]),
  ];
  const first = await suggestWithJev(kv, "u1", qs, "k", jev.fetchImpl);
  assert.deepEqual(first.answers, { "0": { option: "c1", confidence: 0.93 } });
  assert.equal(jev.calls.length, 2);

  const second = await suggestWithJev(kv, "u2", qs, "k", jev.fetchImpl);
  assert.deepEqual(second.answers, first.answers);
  assert.equal(jev.calls.length, 2, "another student's identical questions cost nothing");
  assert.equal(await kv.get("rl:jev:d:u2"), null);
});

test("the daily allowance counts only questions Jev actually gets", async () => {
  const kv = createMemoryKv();
  for (let i = 0; i < SUGGEST_DAILY_LIMIT - 1; i++) await kv.incr("rl:jev:d:u1", 86400);
  const jev = fakeJev({ "": { choice: "same", confidence: 0.9 } });
  const qs = [0, 1].map((i) => duplicateQuestion(String(i), { title: `A${i}`, source: "canvas", time: "all day" }, { title: "B", source: "neptun", time: "all day" }));
  const res = await suggestWithJev(kv, "u1", qs, "k", jev.fetchImpl);
  assert.equal(jev.calls.length, 1);
  assert.equal(res.limited, true);
  assert.deepEqual(Object.keys(res.answers), ["0"]);
});
