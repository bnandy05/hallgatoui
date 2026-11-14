import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHANGE_DAYS,
  DEFAULT_ALERT_KINDS,
  filterAlerts,
  gradeAlerts,
  type GradeAlert,
  type GradeAlertInput,
} from "@/lib/gradeAlerts";
import { alertKindsFrom, alertPrefsFrom } from "@/lib/alertPrefs";
import { parseAppData } from "@/lib/importData";
import { mergeAppData, type SyncPayload } from "@/lib/sync/merge";
import { buildCalendar, DEFAULT_EXPORT_OPTIONS } from "@/lib/ical/export";
import { resultId, type RequirementResult, type RequirementRules, type SubjectRules } from "@/lib/rules/types";
import { asg, grade, NOW, pts, res, rules, seriesPts } from "./rulesHelpers";
import { emptyAppData, makeCourse, makeDeadline } from "./helpers";
import { deadlineIdentity } from "@/lib/ical/dedupe";

const DAY = 24 * 60 * 60 * 1000;

// Week 1 starts on NOW's Monday: week 1 is under way (urgent), week 2 is a week ahead.
function input(
  source: SubjectRules,
  results: RequirementResult[],
  links: Record<string, number> = {},
  now = NOW
): GradeAlertInput {
  const r: RequirementRules = {
    ...source,
    id: "rules:c",
    courseId: "c",
    source: "template",
    calendarLinks: Object.fromEntries(Object.entries(links).map(([k, w]) => [k, { mode: "weeks" as const, weeks: [w] }])),
  };
  return { courses: [makeCourse("c", "Kurzus")], rules: [r], results, sessions: [], deadlines: [], semester: { start: "2026-10-05" }, now };
}

/** Two 40-point exams; 2 at 50 points, 3 at 52, 4 at 54, 5 at 56. */
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

const withUpdate = (r: RequirementResult, daysAgo: number): RequirementResult => ({
  ...r,
  updatedAt: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
});
const kind = (alerts: GradeAlert[], k: GradeAlert["kind"]) => alerts.filter((a) => a.kind === k);
const rzh = (total: number) => seriesPts("rzh", Array.from({ length: 10 }, (_, i) => Math.min(4, Math.max(0, total - 4 * i))));

// ----- opportunity -----

test("opportunity: needing exactly REACHABLE_SHARE of the maximum counts, a point more does not", () => {
  // zh1 = 20: the 3 needs 32/40 = 0.8 on zh2 (the 4 and 5 need more).
  const on = gradeAlerts(input(SIMPLE, [pts("zh1", 20)], { zh2: 2 }));
  const opp = kind(on, "opportunity");
  assert.equal(opp.length, 1);
  assert.equal(opp[0].severity, "info");
  assert.match(opp[0].text, /32\/40 pont kell a 3-ashoz/);
  // zh1 = 19: the 3 needs 33/40.
  assert.deepEqual(kind(gradeAlerts(input(SIMPLE, [pts("zh1", 19)], { zh2: 2 })), "opportunity"), []);
});

test("opportunity: the best reachable grade only, and never the pass itself", () => {
  const rs = [...rzh(30), pts("n1", 40), pts("n2", 33)];
  const a = kind(gradeAlerts(input(rules("elte-ik-matalap"), rs, { n3: 2 })), "opportunity");
  assert.equal(a.length, 1);
  assert.match(a[0].text, /40\/50 pont kell az 5-öshöz/);
  // One point less on n2: the 5 needs 41/50, so the 4 (17/50) is the best within reach.
  const b = kind(gradeAlerts(input(rules("elte-ik-matalap"), [...rzh(30), pts("n1", 40), pts("n2", 32)], { n3: 2 })), "opportunity");
  assert.equal(b.length, 1);
  assert.match(b[0].text, /17\/50 pont kell a 4-eshez/);
});

test("opportunity: a grade scale reads as a minimum grade", () => {
  const rs = [asg("b1", "ok"), asg("b2", "ok"), grade("gy1", 3), pts("elm", 24)];
  const a = kind(gradeAlerts(input(rules("elte-ik-dotnet-gui"), rs, { gy2: 2 })), "opportunity");
  assert.equal(a.length, 1);
  assert.match(a[0].text, /legalább 3-as kell a 4-eshez/);
  const en = kind(gradeAlerts(input(rules("elte-ik-dotnet-gui"), rs, { gy2: 2 }), "en"), "opportunity");
  assert.match(en[0].text, /A 3 or better on 2\. gyakorlati zh gets you a 4/);
});

test("opportunity: needs a linked, upcoming assessment (nothing for a far one or an unlinked one)", () => {
  assert.deepEqual(gradeAlerts(input(SIMPLE, [pts("zh1", 20)], {})), []);
  assert.deepEqual(kind(gradeAlerts(input(SIMPLE, [pts("zh1", 20)], { zh2: 6 })), "opportunity"), []); // week 6: > 14 days
});

test("opportunity and hard pass: an exam linked to a calendar deadline (a Canvas midterm) counts too", () => {
  const midterm = makeDeadline({ id: "zh2-canvas", courseId: "c", title: "2. zh", due: "2026-10-09T16:00:00.000Z" });
  const withDeadline = (results: RequirementResult[]): GradeAlertInput => {
    const base = input(SIMPLE, results);
    const r = { ...base.rules[0], calendarLinks: { zh2: { mode: "deadlines" as const, identities: [deadlineIdentity(midterm)] } } };
    return { ...base, rules: [r], deadlines: [midterm] };
  };
  const opp = kind(gradeAlerts(withDeadline([pts("zh1", 20)])), "opportunity");
  assert.equal(opp.length, 1);
  assert.match(opp[0].text, /32\/40 pont kell a 3-ashoz/);
  assert.equal(opp[0].due, midterm.due);
  const hard = kind(gradeAlerts(withDeadline([pts("zh1", 20)])), "risk");
  assert.equal(hard.length, 1);
  assert.equal(hard[0].severity, "warning");
  // A deadline that already has its result produces nothing.
  assert.deepEqual(kind(gradeAlerts(withDeadline([pts("zh1", 20), pts("zh2", 30)])), "opportunity"), []);
});

test("calendar export: the linked midterm's event carries grade notes, a done link and a record link", () => {
  const midterm = makeDeadline({ id: "zh2-canvas", courseId: "c", title: "2. zh", due: "2026-10-09T16:00:00.000Z" });
  const base = input(SIMPLE, [pts("zh1", 20)]);
  const rules = [{ ...base.rules[0], calendarLinks: { zh2: { mode: "deadlines" as const, identities: [deadlineIdentity(midterm)] } } }];
  const build = (gradeInfo: boolean, appUrl?: string) =>
    buildCalendar({
      courses: base.courses,
      deadlines: [midterm],
      now: base.now,
      appUrl,
      options: { ...DEFAULT_EXPORT_OPTIONS, gradeInfo, weeklySummary: false, studyBlocks: false },
      requirements: { rules, results: base.results, semester: base.semester },
    }).replace(/\r\n /g, "");
  const ics = build(true, "https://app.test");
  assert.match(ics, /Jegyek:/);
  assert.match(ics, /32\/40 pont kell a 3-ashoz/);
  assert.match(ics, /Késznek jelölöm: https:\/\/app\.test\/\?kesz=manual%3Azh2-canvas/);
  assert.match(ics, /Eredmény rögzítése: https:\/\/app\.test\/\?potlas=c%7Cd%3Amanual%3Azh2-canvas/);
  // The grade notes can be switched off; without an app URL there are no links.
  assert.doesNotMatch(build(false, "https://app.test"), /Jegyek:/);
  assert.doesNotMatch(build(true), /kesz=|potlas=/);
});

// ----- risk -----

test("risk: hard pass on an upcoming assessment is a warning with the needed score", () => {
  const alerts = gradeAlerts(input(SIMPLE, [pts("zh1", 20)], { zh2: 2 }));
  const risk = kind(alerts, "risk");
  assert.equal(risk.length, 1);
  assert.equal(risk[0].severity, "warning");
  assert.match(risk[0].text, /a 2-eshez 30\/40 pont kell/);
  // Warning before info.
  assert.deepEqual(alerts.map((a) => a.kind), ["risk", "opportunity"]);
  // 40 needed for a pass is hard too; 27/40 (= 0.675) is not.
  assert.equal(kind(gradeAlerts(input(SIMPLE, [pts("zh1", 23)], { zh2: 2 })), "risk").length, 0);
  assert.equal(kind(gradeAlerts(input(SIMPLE, [pts("zh1", 22)], { zh2: 2 })), "risk").length, 1); // 28/40 = 0.7
});

test("risk: passing out of reach is danger, but only once something is recorded", () => {
  const lost = gradeAlerts(input(SIMPLE, [pts("zh1", 5)], { zh2: 2 }));
  const risk = kind(lost, "risk");
  assert.equal(risk.length, 1);
  assert.equal(risk[0].severity, "danger");
  assert.equal(risk[0].urgent, true);
  assert.match(risk[0].text, /Gyakorlati jegy: már nem teljesíthető/);
  assert.match(kind(gradeAlerts(input(SIMPLE, [pts("zh1", 5)], { zh2: 2 }), "en"), "risk")[0].text, /Gyakorlati jegy can no longer be passed/);
  // Nothing recorded, the same rules: an unrecorded future is not "unreachable".
  assert.deepEqual(gradeAlerts(input(SIMPLE, [], { zh1: 1, zh2: 2 })), []);
});

test("risk: nothing early in the term with real templates (no results, everything linked)", () => {
  assert.deepEqual(gradeAlerts(input(rules("elte-ik-progelm"), [], { zh1: 2, zh2: 3, pot: 2 })), []);
  assert.deepEqual(gradeAlerts(input(rules("elte-ik-matalap"), [], { n1: 1, n2: 2, n3: 3 })), []);
  assert.deepEqual(gradeAlerts(input(rules("elte-ik-dotnet-gui"), [], { gy1: 1, gy2: 2, elm: 2 })), []);
  assert.deepEqual(gradeAlerts(input(rules("elte-ttk-analizis1"), [], { z1: 1, z2: 2 })), []);
});

test("risk: a failed condition is danger, one only a retake can fix is a warning", () => {
  // A rejected assignment fails the dotnet 'every assignment accepted' gate for good.
  const failed = kind(gradeAlerts(input(rules("elte-ik-dotnet-gui"), [asg("b1", "elutasitva")])), "risk");
  assert.ok(failed.some((a) => a.severity === "danger" && /Nem teljesült: Minden beadandó elfogadva/.test(a.text)));
  // The unreachable-pass alert is not repeated next to the specific failed condition.
  assert.ok(!failed.some((a) => a.key.startsWith("risk:unreachable")));
  // zh1 failed at 10 with the only fix being the pót: the progelm 'zh2 >= 20' style gates are fixable via retake.
  const rs = [pts("zh1", 40), pts("zh2", 15)];
  const fixable = kind(gradeAlerts(input(rules("elte-ik-progelm"), rs)), "risk");
  assert.ok(fixable.some((a) => a.severity === "warning" && /Javítani kell/.test(a.text)));
  assert.ok(!fixable.some((a) => /Nem teljesült: 2\. zh/.test(a.text)));
});

// ----- absence -----

test("absence: one left warns, none left and over the limit are danger, none recorded stays quiet", () => {
  const abs = (n: number) => Array.from({ length: n }, (_, i) => res("jelen", { kind: "attendance", status: "unexcused" }, i + 1));
  const at = (n: number) => kind(gradeAlerts(input(rules("elte-ik-progelm"), abs(n))), "absence");
  assert.deepEqual(at(0), []);
  assert.deepEqual(at(1), []);
  assert.equal(at(2)[0].severity, "warning");
  assert.equal(at(2)[0].text, "Még 1 hiányzás fér bele");
  assert.equal(at(3)[0].severity, "danger");
  assert.equal(at(3)[0].text, "Több hiányzás nem fér bele");
  assert.equal(at(4)[0].text, "Túllépted a hiányzási határt");
  assert.notEqual(at(2)[0].key, at(3)[0].key);
  assert.equal(kind(gradeAlerts(input(rules("elte-ik-progelm"), abs(2)), "en"), "absence")[0].text, "1 more absence allowed");
});

// ----- change -----

test("change: a result inside CHANGE_DAYS that settles the grade says so; an older one does not", () => {
  const recent = [pts("zh1", 30), withUpdate(pts("zh2", 22), CHANGE_DAYS - 1)];
  const a = kind(gradeAlerts(input(SIMPLE, recent)), "change");
  assert.equal(a.length, 1);
  assert.equal(a[0].text, "Végleges: 3");
  assert.equal(a[0].severity, "info");
  assert.equal(a[0].urgent, false);
  const old = [pts("zh1", 30), withUpdate(pts("zh2", 22), CHANGE_DAYS + 1)];
  assert.deepEqual(kind(gradeAlerts(input(SIMPLE, old)), "change"), []);
  assert.equal(kind(gradeAlerts(input(SIMPLE, recent), "en"), "change")[0].text, "Final: 3");
});

test("change: a secured grade rises, a best grade falls (warning), a failing final is a warning", () => {
  const secured = kind(gradeAlerts(input(SIMPLE, [withUpdate(pts("zh1", 50), 1)])), "change");
  assert.deepEqual(secured.map((a) => a.text), ["A 2-es már biztos"]);
  const lost = kind(gradeAlerts(input(SIMPLE, [withUpdate(pts("zh1", 15), 1)])), "change");
  assert.equal(lost.length, 1);
  assert.equal(lost[0].severity, "warning");
  assert.equal(lost[0].text, "Az 5-ös már nem érhető el");
  assert.equal(kind(gradeAlerts(input(SIMPLE, [withUpdate(pts("zh1", 15), 1)]), "en"), "change")[0].text, "A 5 is no longer reachable");
  const fail = kind(gradeAlerts(input(SIMPLE, [pts("zh1", 20), withUpdate(pts("zh2", 5), 1)])), "change");
  assert.equal(fail[0].severity, "warning");
  assert.equal(fail[0].text, "Végleges: 1");
});

// ----- urgency, order, keys, filter -----

test("urgent: danger always, otherwise an assessment within URGENT_DAYS", () => {
  const now = gradeAlerts(input(SIMPLE, [pts("zh1", 20)], { zh2: 1 })); // week 1: under way
  assert.ok(now.length > 0 && now.every((a) => a.urgent));
  const later = gradeAlerts(input(SIMPLE, [pts("zh1", 20)], { zh2: 2 })); // a week ahead
  assert.ok(later.length > 0 && later.every((a) => !a.urgent));
  assert.ok(later.every((a) => a.due));
  // Two days before the week starts: within URGENT_DAYS.
  const close = gradeAlerts(input(SIMPLE, [pts("zh1", 20)], { zh2: 2 }, new Date("2026-10-10T12:00:00Z")));
  assert.ok(close.every((a) => a.urgent));
});

test("order: danger, warning, info, then by date; keys are stable and follow the situation", () => {
  const a = gradeAlerts(input(SIMPLE, [pts("zh1", 20)], { zh2: 2 }));
  const b = gradeAlerts(input(SIMPLE, [pts("zh1", 20)], { zh2: 2 }));
  assert.deepEqual(a.map((x) => x.key), b.map((x) => x.key));
  assert.equal(new Set(a.map((x) => x.key)).size, a.length);
  const mixed = gradeAlerts({
    ...input(SIMPLE, [withUpdate(pts("zh1", 15), 1)], { zh2: 2 }),
  });
  const rank = { danger: 0, warning: 1, info: 2 } as const;
  for (let i = 1; i < mixed.length; i++) assert.ok(rank[mixed[i - 1].severity] <= rank[mixed[i].severity]);
  const other = gradeAlerts(input(SIMPLE, [pts("zh1", 24)], { zh2: 2 }));
  assert.notDeepEqual(kind(a, "opportunity").map((x) => x.key), kind(other, "opportunity").map((x) => x.key));
});

test("filterAlerts keeps the kinds switched on; courses without rules produce nothing", () => {
  const alerts = gradeAlerts(input(SIMPLE, [pts("zh1", 20)], { zh2: 2 }));
  assert.deepEqual(filterAlerts(alerts, DEFAULT_ALERT_KINDS), alerts);
  assert.deepEqual(filterAlerts(alerts), alerts);
  assert.deepEqual(filterAlerts(alerts, { ...DEFAULT_ALERT_KINDS, opportunity: false }).map((a) => a.kind), ["risk"]);
  assert.deepEqual(filterAlerts(alerts, { opportunity: false, risk: false, absence: false, change: false }), []);
  assert.deepEqual(gradeAlerts({ ...input(SIMPLE, [pts("zh1", 20)], { zh2: 2 }), rules: [] }), []);
  assert.deepEqual(gradeAlerts({ ...input(SIMPLE, [pts("zh1", 20)], { zh2: 2 }), courses: [] }), []);
});

test("a result of another course never leaks in", () => {
  const foreign = { ...pts("zh1", 5), courseId: "other", id: resultId("other", "zh1", "n:1") };
  assert.deepEqual(gradeAlerts(input(SIMPLE, [foreign], { zh2: 2 })), []);
});

// ----- alertPrefs: parse and merge -----

test("alertPrefs: parsing drops malformed values and defaults missing kinds to on", () => {
  assert.equal(alertKindsFrom("x"), undefined);
  assert.deepEqual(alertKindsFrom({ risk: false, absence: "no" }), { opportunity: true, risk: false, absence: true, change: true });
  assert.equal(alertPrefsFrom({ bell: "all" }), undefined);
  assert.equal(alertPrefsFrom(null), undefined);
  assert.deepEqual(alertPrefsFrom({ bell: { change: false }, updatedAt: "2026-10-05T10:00:00.000Z" }), {
    bell: { opportunity: true, risk: true, absence: true, change: false },
    updatedAt: "2026-10-05T10:00:00.000Z",
  });
  assert.deepEqual(alertPrefsFrom({ bell: {}, updatedAt: "nonsense" }), { bell: DEFAULT_ALERT_KINDS });
  const base = { version: 1, courses: [], deadlines: [], customPlatforms: [], feeds: [] };
  assert.equal("alertPrefs" in parseAppData({ ...base, alertPrefs: 7 }), false);
  assert.equal(parseAppData({ ...base, alertPrefs: { bell: { risk: false } } }).alertPrefs?.bell.risk, false);
});

test("alertPrefs: the side that changed wins, changed on both the later edit", () => {
  const T0 = "2026-10-05T10:00:00.000Z";
  const T1 = "2026-10-05T11:00:00.000Z";
  const T2 = "2026-10-05T12:00:00.000Z";
  const prefs = (risk: boolean, updatedAt: string) => ({ bell: { ...DEFAULT_ALERT_KINDS, risk }, updatedAt });
  const p = (alertPrefs?: ReturnType<typeof prefs>): SyncPayload => ({
    data: { ...emptyAppData(), ...(alertPrefs && { alertPrefs }) },
    exportOptions: DEFAULT_EXPORT_OPTIONS,
  });
  const base = p(prefs(true, T0));
  assert.equal(mergeAppData(base, p(prefs(false, T1)), p(prefs(true, T0))).data.alertPrefs?.bell.risk, false);
  assert.equal(mergeAppData(base, p(prefs(true, T0)), p(prefs(false, T1))).data.alertPrefs?.bell.risk, false);
  assert.equal(mergeAppData(base, p(prefs(false, T1)), p(prefs(true, T2))).data.alertPrefs?.updatedAt, T2);
  assert.equal("alertPrefs" in mergeAppData(p(), p(), p()).data, false);
});
