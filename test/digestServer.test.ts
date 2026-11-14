import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAccountStore } from "@/lib/server/account/memoryStore";
import type { AccountStore, StoredUser } from "@/lib/server/account/store";
import { DEFAULT_EXPORT_OPTIONS } from "@/lib/ical/export";
import {
  removeDigest,
  runDigest,
  saveDigest,
  unsubscribeDigest,
  unsubscribeUrl,
  type StoredDigest,
} from "@/lib/server/digest";
import type { OutgoingEmail } from "@/lib/server/email";
import { DIGEST_INDEX_KEY, digKey } from "@/lib/server/subscription";
import { saveData } from "@/lib/server/validate";
import type { AppData } from "@/lib/types";
import { emptyAppData, makeCourse, makeDeadline } from "./helpers";

const APP = "https://app.example.hu";
const MONDAY = new Date("2026-10-05T04:00:00.000Z");
const TUESDAY = new Date("2026-10-06T04:00:00.000Z");
const NEXT_MONDAY = new Date("2026-10-12T04:00:00.000Z");

function data(due: string): AppData {
  return {
    ...emptyAppData(),
    courses: [makeCourse("c1", "Analízis")],
    deadlines: [makeDeadline({ id: "d1", courseId: "c1", due })],
  };
}

async function setup(email = "anna@example.hu", verified = true, due = "2026-10-07T21:59:00.000Z") {
  const store = createMemoryAccountStore();
  const user: StoredUser = {
    id: "u1",
    email,
    createdAt: MONDAY.toISOString(),
    emailVerifiedAt: verified ? MONDAY.toISOString() : undefined,
  };
  await store.putUser(user);
  await saveData(store, user.id, 0, data(due), DEFAULT_EXPORT_OPTIONS, MONDAY);
  const mails: OutgoingEmail[] = [];
  const send = async (m: OutgoingEmail) => (mails.push(m), true);
  return { store, user, mails, send };
}

const stored = (store: AccountStore) => store.kv.get<StoredDigest>(digKey("u1"));

test("save → one digest per period to the account email → unsubscribe", async () => {
  const { store, mails, send } = await setup();
  const saved = await saveDigest(store.kv, "u1", null, "heti", MONDAY);
  assert.equal(saved.frequency, "heti");
  assert.ok((await store.kv.smembers(DIGEST_INDEX_KEY)).includes("u1"));

  // Saved in the week of Oct 5: the first weekly digest goes out next Monday, once.
  assert.equal(await runDigest(store, "u1", TUESDAY, APP, send), "skipped");
  assert.equal(await runDigest(store, "u1", NEXT_MONDAY, APP, send), "sent");
  assert.equal(await runDigest(store, "u1", NEXT_MONDAY, APP, send), "skipped");
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, "anna@example.hu");
  assert.ok((await stored(store))?.lastSentAt);

  const { unsubscribeKey } = (await stored(store))!;
  assert.ok(mails[0].headers?.["List-Unsubscribe"]?.includes("u=u1"));
  assert.ok(unsubscribeUrl(APP, "u1", unsubscribeKey).includes("u=u1"));
  assert.equal(await unsubscribeDigest(store.kv, "u1", "nope"), "invalid");
  assert.equal(await unsubscribeDigest(store.kv, "u1", unsubscribeKey), "ok");
  assert.equal(await stored(store), null);
  assert.ok(!(await store.kv.smembers(DIGEST_INDEX_KEY)).includes("u1"));
});

test("changing the account email redirects the next digest", async () => {
  const { store, user, mails, send } = await setup();
  await saveDigest(store.kv, "u1", null, "heti", MONDAY);
  await store.putUser({ ...user, email: "new@example.hu" });
  assert.equal(await runDigest(store, "u1", NEXT_MONDAY, APP, send), "sent");
  assert.equal(mails[0].to, "new@example.hu");
});

test("an unverified user is skipped, not removed", async () => {
  const { store, mails, send } = await setup("x@example.hu", false);
  await saveDigest(store.kv, "u1", null, "heti", MONDAY);
  assert.equal(await runDigest(store, "u1", NEXT_MONDAY, APP, send), "skipped");
  assert.equal(mails.length, 0);
  assert.ok(await stored(store));
});

test("a deleted user is removed from the index", async () => {
  const { store, send } = await setup();
  await saveDigest(store.kv, "u1", null, "heti", MONDAY);
  await store.deleteUser("u1");
  assert.equal(await runDigest(store, "u1", NEXT_MONDAY, APP, send), "removed");
  assert.equal(await stored(store), null);
  assert.ok(!(await store.kv.smembers(DIGEST_INDEX_KEY)).includes("u1"));
});

test("a user without data yet is skipped", async () => {
  const { store, send } = await setup();
  await saveDigest(store.kv, "u1", null, "heti", MONDAY);
  await store.deleteData("u1");
  assert.equal(await runDigest(store, "u1", NEXT_MONDAY, APP, send), "skipped");
});

test("a daily digest with nothing due today or tomorrow is empty and counts as done", async () => {
  const { store, mails, send } = await setup("a@example.hu", true, "2026-10-20T21:59:00.000Z");
  await saveDigest(store.kv, "u1", null, "napi", MONDAY);
  assert.equal(await runDigest(store, "u1", TUESDAY, APP, send), "empty");
  assert.equal(await runDigest(store, "u1", TUESDAY, APP, send), "skipped");
  assert.equal(mails.length, 0);
});

test("changing only the frequency keeps the key and starts with the next period", async () => {
  const { store } = await setup();
  const first = await saveDigest(store.kv, "u1", null, "heti", MONDAY);
  const next = await saveDigest(store.kv, "u1", first, "havi", MONDAY);
  assert.equal(next.unsubscribeKey, first.unsubscribeKey);
  assert.equal(next.lastPeriod, "m:202610");
  const same = await saveDigest(store.kv, "u1", next, "havi", TUESDAY);
  assert.equal(same.lastPeriod, "m:202610");
});

test("removeDigest deletes the record and the index entry", async () => {
  const { store } = await setup();
  await saveDigest(store.kv, "u1", null, "heti", MONDAY);
  await removeDigest(store.kv, "u1");
  assert.equal(await stored(store), null);
  assert.ok(!(await store.kv.smembers(DIGEST_INDEX_KEY)).includes("u1"));
});

test("the digest lists linked classes that ended without a result", async () => {
  const { RULE_TEMPLATES } = await import("@/lib/rules/fixtures");
  const { store, mails, send } = await setup();
  const session = {
    id: "s1", sourceId: "src", externalUid: "uid-1", kind: "ora" as const, subject: "Programming theory", subjectKey: "programming theory",
    group: "6", teachers: [], start: "2026-10-05T06:00:00.000Z", end: "2026-10-05T07:30:00.000Z", courseId: "c1",
  };
  const doc: AppData = {
    ...data("2026-12-01T10:00:00.000Z"),
    classSessions: [session],
    timetableSources: [{ id: "src", name: "Neptun órarend", importedAt: MONDAY.toISOString(), subjectCourses: { "programming theory": "c1" } }],
    requirementRules: [{
      ...RULE_TEMPLATES[1].rules, id: "rules:c1", courseId: "c1", source: "template",
      calendarLinks: { jelen: { mode: "sessions", selector: {}, since: "2026-10-04T22:00:00.000Z" } },
    }],
  };
  await saveData(store, "u1", 1, doc, DEFAULT_EXPORT_OPTIONS, MONDAY);
  await saveDigest(store.kv, "u1", null, "napi", MONDAY);
  // Tuesday morning: Monday's class has no attendance yet, nothing is due today or tomorrow.
  assert.equal(await runDigest(store, "u1", TUESDAY, APP, send), "sent");
  assert.match(mails[0].text, /Rögzítésre vár/);
  assert.match(mails[0].text, /Analízis: okt\. 5\. \(H\) 08:00: jelenlét/);
});
