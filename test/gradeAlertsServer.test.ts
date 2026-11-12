import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAccountStore } from "@/lib/server/account/memoryStore";
import type { StoredUser } from "@/lib/server/account/store";
import { DEFAULT_EXPORT_OPTIONS } from "@/lib/ical/export";
import { DEFAULT_ALERT_KINDS } from "@/lib/gradeAlerts";
import { renderGradeAlertEmail } from "@/lib/gradeAlertEmail";
import { collectDigest, shouldSendDigest } from "@/lib/digest";
import { runDigest, saveDigest } from "@/lib/server/digest";
import { emailKindsFrom, runGradeAlerts, saveAlerts, unsubscribeAlerts, type StoredAlerts } from "@/lib/server/gradeAlerts";
import { ALERT_INDEX_KEY, alrKey } from "@/lib/server/subscription";
import { saveData } from "@/lib/server/validate";
import type { OutgoingEmail } from "@/lib/server/email";
import type { AppData, AlertKinds } from "@/lib/types";
import type { RequirementRules, SubjectRules } from "@/lib/rules/types";
import { POST as hirlevelPost } from "@/app/api/hirlevel/route";
import { pts } from "./rulesHelpers";
import { emptyAppData, makeCourse } from "./helpers";

const APP = "https://app.example.hu";
const TUESDAY = new Date("2026-10-06T08:00:00.000Z");
const WEDNESDAY = new Date("2026-10-07T08:00:00.000Z");

const SIMPLE: SubjectRules = {
  schemaVersion: 1,
  components: [
    { id: "zh1", label: "1. zh", kind: "exam", scale: { kind: "points", max: 40 } },
    { id: "zh2", label: "2. zh", kind: "exam", scale: { kind: "points", max: 40 } },
  ],
  retakes: [],
  tables: [{ id: "t", rows: [{ min: 0, value: 1 }, { min: 50, value: 2 }, { min: 52, value: 3 }, { min: 54, value: 4 }, { min: 56, value: 5 }] }],
  derived: [{ id: "ossz", label: "Összesen", expr: "zh1 + zh2" }],
  outcomes: [{ id: "gyak", label: "Gyakorlati jegy", kind: "gyakorlat", select: "first", paths: [{ id: "alap", label: "Pontszám", grade: "table(t, ossz)" }] }],
  flags: [],
};

/** zh1 = 5 and zh2 in week 1: passing is out of reach (a danger "risk" alert, always urgent). */
function data(): AppData {
  const r: RequirementRules = {
    ...SIMPLE,
    id: "rules:c",
    courseId: "c",
    source: "template",
    calendarLinks: { zh2: { mode: "weeks", weeks: [1] } },
  };
  return {
    ...emptyAppData(),
    courses: [makeCourse("c", "Analízis")],
    requirementRules: [r],
    requirementResults: [pts("zh1", 5)],
    semester: { start: "2026-10-05" },
  };
}

async function setup(opts: { verified?: boolean; locale?: "hu" | "en"; kinds?: AlertKinds } = {}) {
  const store = createMemoryAccountStore();
  const user: StoredUser = {
    id: "u1",
    email: "anna@example.hu",
    createdAt: TUESDAY.toISOString(),
    emailVerifiedAt: opts.verified === false ? undefined : TUESDAY.toISOString(),
    ...(opts.locale && { locale: opts.locale, localeExplicit: true }),
  };
  await store.putUser(user);
  await saveData(store, user.id, 0, data(), DEFAULT_EXPORT_OPTIONS, TUESDAY);
  await saveAlerts(store.kv, "u1", null, opts.kinds ?? DEFAULT_ALERT_KINDS);
  const mails: OutgoingEmail[] = [];
  const send = async (m: OutgoingEmail) => (mails.push(m), true);
  return { store, user, mails, send };
}

const record = (store: { kv: { get<T>(k: string): Promise<T | null> } }) => store.kv.get<StoredAlerts>(alrKey("u1"));

test("runGradeAlerts: one mail per Budapest day, never the same key again, headers for one-click", async () => {
  const { store, mails, send } = await setup();
  assert.equal(await runGradeAlerts(store, "u1", TUESDAY, APP, send), "sent");
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, "anna@example.hu");
  const rec = (await record(store))!;
  assert.match(mails[0].headers!["List-Unsubscribe"], new RegExp(`^<${APP}/api/hirlevel\\?m=riaszto&u=u1&k=${encodeURIComponent(rec.unsubscribeKey)}>$`));
  assert.equal(mails[0].headers!["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.ok(mails[0].html.includes(`${APP}/hirlevel?m=riaszto&amp;u=u1&amp;k=`));
  assert.ok(Object.keys(rec.sent).length > 0);

  // Same day: skipped. Next day: the key was told already, so nothing to say.
  assert.equal(await runGradeAlerts(store, "u1", new Date(TUESDAY.getTime() + 3600_000), APP, send), "skipped");
  assert.equal(await runGradeAlerts(store, "u1", WEDNESDAY, APP, send), "empty");
  assert.equal(mails.length, 1);
});

test("runGradeAlerts: a failed send is retried and records nothing", async () => {
  const { store, mails, send } = await setup();
  assert.equal(await runGradeAlerts(store, "u1", TUESDAY, APP, async () => false), "failed");
  assert.deepEqual((await record(store))!.sent, {});
  assert.equal(await runGradeAlerts(store, "u1", TUESDAY, APP, send), "sent");
  assert.equal(mails.length, 1);
});

test("runGradeAlerts: sent keys are forgotten after 30 days", async () => {
  const { store, send } = await setup();
  await runGradeAlerts(store, "u1", TUESDAY, APP, send);
  const rec = (await record(store))!;
  const old = Object.fromEntries(Object.keys(rec.sent).map((k) => [k, "2026-08-01T00:00:00.000Z"]));
  await store.kv.set(alrKey("u1"), { ...rec, sent: { ...old, "keep|info": TUESDAY.toISOString() }, lastUrgentDay: undefined });
  // The danger key is no longer remembered, so it is told again; the old ones were pruned.
  assert.equal(await runGradeAlerts(store, "u1", WEDNESDAY, APP, send), "sent");
  const after = (await record(store))!;
  assert.ok(after.sent["keep|info"]);
  assert.ok(Object.values(after.sent).every((at) => at !== "2026-08-01T00:00:00.000Z"));
});

test("runGradeAlerts: only the email kinds are mailed", async () => {
  const { store, mails, send } = await setup({ kinds: { opportunity: true, risk: false, absence: false, change: false } });
  assert.equal(await runGradeAlerts(store, "u1", TUESDAY, APP, send), "empty");
  assert.equal(mails.length, 0);
});

test("runGradeAlerts: an unverified address is skipped, a deleted user is removed from the index", async () => {
  const a = await setup({ verified: false });
  assert.equal(await runGradeAlerts(a.store, "u1", TUESDAY, APP, a.send), "skipped");
  assert.equal(a.mails.length, 0);

  const gone = createMemoryAccountStore();
  await saveAlerts(gone.kv, "ghost", null, DEFAULT_ALERT_KINDS);
  assert.equal(await runGradeAlerts(gone, "ghost", TUESDAY, APP, a.send), "removed");
  assert.equal(await gone.kv.get(alrKey("ghost")), null);
  assert.deepEqual(await gone.kv.smembers(ALERT_INDEX_KEY), []);
});

test("saveAlerts: all kinds off deletes the record and the index entry; a key is kept across saves", async () => {
  const { store } = await setup();
  const first = (await record(store))!;
  const again = await saveAlerts(store.kv, "u1", first, { ...DEFAULT_ALERT_KINDS, change: false });
  assert.equal(again!.unsubscribeKey, first.unsubscribeKey);
  assert.equal(await saveAlerts(store.kv, "u1", again, { opportunity: false, risk: false, absence: false, change: false }), null);
  assert.equal(await record(store), null);
  assert.deepEqual(await store.kv.smembers(ALERT_INDEX_KEY), []);
});

test("emailKindsFrom: every kind must be a boolean", () => {
  assert.deepEqual(emailKindsFrom({ opportunity: true, risk: false, absence: true, change: false }), { opportunity: true, risk: false, absence: true, change: false });
  assert.equal(emailKindsFrom({ opportunity: true }), null);
  assert.equal(emailKindsFrom({ opportunity: "yes", risk: true, absence: true, change: true }), null);
  assert.equal(emailKindsFrom(null), null);
  assert.equal(emailKindsFrom([true, true, true, true]), null);
});

test("unsubscribeAlerts: needs the key, removes only the alerts (the digest stays)", async () => {
  const { store } = await setup();
  await saveDigest(store.kv, "u1", null, "heti", TUESDAY);
  const rec = (await record(store))!;
  assert.equal(await unsubscribeAlerts(store.kv, "u1", "wrong"), "invalid");
  assert.ok(await record(store));
  assert.equal(await unsubscribeAlerts(store.kv, "u1", rec.unsubscribeKey), "ok");
  assert.equal(await record(store), null);
  assert.ok(await store.kv.get("dig:u1"));
  assert.equal(await unsubscribeAlerts(store.kv, "u1", "anything"), "ok"); // already off
});

test("the digest has a Jegyek block only with an alerts record, only its kinds, and it never decides the send", async () => {
  const withAlerts = await setup();
  await saveDigest(withAlerts.store.kv, "u1", null, "heti", TUESDAY);
  assert.equal(await runDigest(withAlerts.store, "u1", new Date("2026-10-12T04:00:00.000Z"), APP, withAlerts.send), "sent");
  assert.match(withAlerts.mails[0].text, /Jegyek|jegy/i);
  assert.match(withAlerts.mails[0].text, /nem teljesíthető/);

  const noRisk = await setup({ kinds: { opportunity: true, risk: false, absence: true, change: true } });
  await saveDigest(noRisk.store.kv, "u1", null, "heti", TUESDAY);
  await runDigest(noRisk.store, "u1", new Date("2026-10-12T04:00:00.000Z"), APP, noRisk.send);
  assert.doesNotMatch(noRisk.mails[0].text, /nem teljesíthető/);

  const without = await setup();
  await without.store.kv.del(alrKey("u1"));
  await saveDigest(without.store.kv, "u1", null, "heti", TUESDAY);
  await runDigest(without.store, "u1", new Date("2026-10-12T04:00:00.000Z"), APP, without.send);
  assert.doesNotMatch(without.mails[0].text, /nem teljesíthető/);

  // Grades alone never make a daily digest worth sending.
  const grades = [{ courseId: "c", courseName: "Analízis", text: "x", severity: "danger" as const }];
  const content = collectDigest({ frequency: "napi", courses: [], deadlines: [], feeds: [], ignoredDuplicatePairs: [], dedupe: true, grades, now: TUESDAY });
  assert.equal(content.grades.length, 1);
  assert.equal(shouldSendDigest("napi", content), false);
});

test("the alert mail renders in English with the unsubscribe link and a text part", () => {
  const mail = renderGradeAlertEmail({
    alerts: [{ courseId: "c", courseName: "Analysis", text: "Passing can no longer be reached", severity: "danger" }],
    appUrl: APP,
    unsubscribeUrl: `${APP}/hirlevel?m=riaszto&u=u1&k=abc`,
    locale: "en",
  });
  assert.match(mail.html, /lang="en"/);
  assert.match(mail.html, /Analysis/);
  assert.match(mail.html, /m=riaszto&amp;u=u1&amp;k=abc|m=riaszto&u=u1&k=abc/);
  assert.match(mail.text, /m=riaszto&u=u1&k=abc/);
  assert.doesNotMatch(mail.subject, /Jegy/);
});

test("POST /api/hirlevel one-click: an unknown action is refused, riaszto is a known one", async () => {
  const bad = await hirlevelPost(new Request(`${APP}/api/hirlevel?m=other&u=u1&k=abc`, { method: "POST" }));
  assert.equal(bad.status, 400);
  const noKey = await hirlevelPost(new Request(`${APP}/api/hirlevel?m=riaszto&u=u1`, { method: "POST" }));
  assert.equal(noKey.status, 400);
});
