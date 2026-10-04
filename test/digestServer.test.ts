import { test } from "node:test";
import assert from "node:assert/strict";
import { getKv } from "@/lib/server/kv";
import {
  confirmDigest,
  requestDigest,
  runDigest,
  unsubscribeDigest,
  type StoredDigest,
} from "@/lib/server/digest";
import { DIGEST_INDEX_KEY, digKey, subKey, type StoredSubscription } from "@/lib/server/subscription";
import { makeCourse, makeDeadline } from "./helpers";

// Without Upstash credentials (and outside production) getKv is the in-memory store and
// sendEmail only logs, so the whole server flow runs offline.

const APP = "https://app.example.hu";
const MONDAY = new Date("2026-10-05T04:00:00.000Z");
const TUESDAY = new Date("2026-10-06T04:00:00.000Z");

function subscription(): StoredSubscription {
  return {
    secretHash: "x",
    updatedAt: MONDAY.toISOString(),
    snapshot: {
      courses: [makeCourse("c1", "Analízis")],
      deadlines: [makeDeadline({ id: "d1", courseId: "c1", due: "2026-10-07T21:59:00.000Z" })],
      feeds: [],
      customPlatforms: [],
      ignoredDuplicatePairs: [],
      classSessions: [],
      options: { includeDone: false, alarms: true, weeklySummary: true, studyBlocks: true, dedupe: true, includeClasses: false },
    },
  };
}

test("request → confirm → one digest per period → unsubscribe", async (t) => {
  t.mock.method(console, "info", () => {});
  const kv = getKv()!;
  const token = "tok_digest_flow_000000000";
  await kv.set(subKey(token), subscription(), 600);

  const requested = await requestDigest(kv, token, null, "a@example.hu", "napi", APP, MONDAY);
  assert.equal(requested?.confirmed, false);
  assert.ok((await kv.smembers(DIGEST_INDEX_KEY)).includes(token));
  assert.equal(await runDigest(kv, token, MONDAY, APP), "skipped"); // not confirmed yet

  assert.equal(await confirmDigest(kv, token, "wrong-key", MONDAY), "invalid");
  // The raw key only travels in the mail; reproduce it by replacing the stored hash.
  const { hashSecret } = await import("@/lib/server/subscription");
  const stored = (await kv.get<StoredDigest>(digKey(token)))!;
  await kv.set(digKey(token), { ...stored, confirmHash: hashSecret("k") }, 600);
  assert.equal(await confirmDigest(kv, token, "k", MONDAY), "ok");

  // Confirmed on Monday: the first daily digest goes out on Tuesday, once.
  assert.equal(await runDigest(kv, token, MONDAY, APP), "skipped");
  assert.equal(await runDigest(kv, token, TUESDAY, APP), "sent");
  assert.equal(await runDigest(kv, token, TUESDAY, APP), "skipped");
  assert.ok((await kv.get<StoredDigest>(digKey(token)))?.lastSentAt);

  const { unsubscribeKey } = (await kv.get<StoredDigest>(digKey(token)))!;
  assert.equal(await unsubscribeDigest(kv, token, "nope"), "invalid");
  assert.equal(await unsubscribeDigest(kv, token, unsubscribeKey), "ok");
  assert.equal(await kv.get(digKey(token)), null);
  assert.ok(!(await kv.smembers(DIGEST_INDEX_KEY)).includes(token));
});

test("an expired confirmation and a vanished subscription clean themselves up", async (t) => {
  t.mock.method(console, "info", () => {});
  const kv = getKv()!;
  const token = "tok_digest_cleanup_000000";
  await requestDigest(kv, token, null, "b@example.hu", "heti", APP, MONDAY);
  // No subscription stored for this token.
  assert.equal(await runDigest(kv, token, TUESDAY, APP), "removed");
  assert.equal(await kv.get(digKey(token)), null);

  await kv.set(subKey(token), subscription(), 600);
  await requestDigest(kv, token, null, "b@example.hu", "heti", APP, MONDAY);
  const threeDaysLater = new Date(MONDAY.getTime() + 3 * 24 * 60 * 60 * 1000);
  assert.equal(await runDigest(kv, token, threeDaysLater, APP), "removed");
});

test("changing only the frequency keeps a confirmed address confirmed", async (t) => {
  t.mock.method(console, "info", () => {});
  const kv = getKv()!;
  const token = "tok_digest_freq_000000000";
  const confirmed: StoredDigest = {
    email: "c@example.hu",
    frequency: "napi",
    confirmed: true,
    requestedAt: MONDAY.toISOString(),
    unsubscribeKey: "u",
    lastPeriod: "d:20261005",
  };
  const next = await requestDigest(kv, token, confirmed, "c@example.hu", "havi", APP, MONDAY);
  assert.equal(next?.confirmed, true);
  assert.equal(next?.lastPeriod, "m:202610");
  const moved = await requestDigest(kv, token, confirmed, "d@example.hu", "havi", APP, MONDAY);
  assert.equal(moved?.confirmed, false);
  assert.equal(moved?.unsubscribeKey, "u");
});
