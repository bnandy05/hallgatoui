import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCalendar } from "@/lib/ical/export";
import { parseIcs, UNTITLED } from "@/lib/ical/parse";
import { collectDigest } from "@/lib/digest";
import { formatDigestDue, renderDigestEmail } from "@/lib/digestEmail";
import { renderAuthEmail } from "@/lib/authEmail";
import { parseQuickDeadline } from "@/lib/quickAdd";
import { formatRelative, groupByWeek } from "@/lib/radar";
import { dueNotifications } from "@/lib/notifications";
import { buildSearchItems } from "@/lib/search";
import { pickLocale } from "@/lib/i18n";
import { privacyContent } from "@/lib/privacy";
import { requestLocale, userLocale } from "@/lib/server/locale";
import { createMemoryAccountStore } from "@/lib/server/account/memoryStore";
import { DEFAULT_EXPORT_OPTIONS } from "@/lib/ical/export";
import { renderCalendar } from "@/lib/server/calendar";
import { saveData } from "@/lib/server/validate";
import {
  consumeLink,
  isAuthError,
  login,
  register,
  setAccountLocale,
  type AuthDeps,
} from "@/lib/server/auth/service";
import { authErrorResponse } from "@/lib/server/auth/http";
import type { OutgoingEmail } from "@/lib/server/email";
import type { Locale } from "@/lib/i18n";
import { emptyAppData, makeCourse, makeDeadline } from "./helpers";

// Monday 2026-10-05, 10:00 Budapest.
const NOW = new Date("2026-10-05T08:00:00.000Z");
const APP = "https://app.example.hu";

// ---- calendar ----

test("English calendar: summaries, previous deadline, sources and view names", () => {
  const courses = [makeCourse("c1", "Discrete maths")];
  const deadlines = [
    makeDeadline({
      id: "a", courseId: "c1", title: "Assignment 4", due: "2026-10-06T21:59:00.000Z", critical: true,
      previousDue: "2026-10-05T21:59:00.000Z", dueChangedAt: NOW.toISOString(),
    }),
    makeDeadline({ id: "b", courseId: "c1", title: "Reading", due: "2026-10-08T16:00:00.000Z" }),
  ];
  const ics = buildCalendar({ courses, deadlines, now: NOW, appUrl: APP, locale: "en" });
  const events = parseIcs(ics);
  const a = events.find((e) => e.summary.includes("Assignment 4"))!;
  assert.ok(a.summary.endsWith("(changed)"), a.summary);
  assert.ok(a.description?.includes("Previous deadline: 05/10/2026 23:59"), a.description);
  assert.ok(a.description?.includes(`Open: ${APP}/targy/c1`));
  assert.ok(events.some((e) => e.summary.startsWith("📋 Weekly radar: 2 deadlines, 1 critical")));
  assert.ok(events.some((e) => e.summary.startsWith("📚 Study time:")));
  assert.match(ics, /PRODID:-\/\/Hallgatoi reteg\/\/EN/);
  assert.ok(ics.includes("X-WR-CALNAME:Hallgatói réteg"));
  const critical = buildCalendar({ courses, deadlines, now: NOW, view: { kind: "critical" }, locale: "en" });
  assert.ok(critical.includes("X-WR-CALNAME:Hallgatói réteg – Critical"));
});

test("the Hungarian calendar is unchanged by the locale option's absence", () => {
  const deadlines = [makeDeadline({ id: "a", title: "ZH 1", due: "2026-10-06T21:59:00.000Z", critical: true })];
  const ics = buildCalendar({ courses: [], deadlines, now: NOW });
  assert.ok(ics.includes("Heti radar"));
  assert.ok(ics.includes("Készülés"));
  assert.match(ics, /PRODID:-\/\/Hallgatoi reteg\/\/HU/);
});

test("renderCalendar follows the account language and keys its cache by it", async () => {
  const store = createMemoryAccountStore();
  const data = {
    ...emptyAppData(),
    deadlines: [makeDeadline({ id: "d1", title: "Essay", due: "2026-10-08T21:59:00.000Z", critical: true })],
  };
  await store.putUser({ id: "u1", email: "a@x.hu", createdAt: NOW.toISOString(), locale: "en", localeExplicit: true });
  await saveData(store, "u1", 0, data, DEFAULT_EXPORT_OPTIONS, NOW);
  const english = await renderCalendar(store, "u1", NOW, APP);
  assert.ok(english?.includes("Weekly radar"));
  assert.deepEqual(await store.kv.smembers("icsk:u1"), ["ics:u1:en:osszes"]);
  assert.ok(await store.kv.get("ics:u1:en:osszes"));

  // Switching the language drops the cache; the next render is Hungarian.
  const deps: AuthDeps = { store, send: async () => true, now: () => NOW, appUrl: APP, ip: "1.1.1.1" };
  const user = (await store.getUser("u1"))!;
  await setAccountLocale(deps, user, "hu");
  assert.deepEqual(await store.kv.smembers("icsk:u1"), []);
  const hungarian = await renderCalendar(store, "u1", NOW, APP);
  assert.ok(hungarian?.includes("Heti radar"));
  assert.deepEqual(await store.kv.smembers("icsk:u1"), ["ics:u1:hu:osszes"]);
});

// ---- digest and auth mails ----

test("English digest mail: weekly and daily", () => {
  const courses = [makeCourse("c1", "Discrete maths")];
  const deadlines = [
    makeDeadline({ id: "late", title: "Report", due: "2026-10-03T10:00:00.000Z", courseId: "c1" }),
    makeDeadline({ id: "today", title: "Quiz 1", courseId: "c1", due: "2026-10-05T10:00:00.000Z", critical: true }),
    makeDeadline({ id: "fri", title: "Homework 3", due: "2026-10-09T21:59:00.000Z" }),
  ];
  const base = { courses, deadlines, feeds: [], ignoredDuplicatePairs: [], dedupe: true, now: NOW };
  const weekly = renderDigestEmail({
    frequency: "heti",
    content: collectDigest({ ...base, frequency: "heti" }),
    now: NOW, appUrl: APP, unsubscribeUrl: "https://u", locale: "en",
  });
  assert.equal(weekly.subject, "Weekly summary: 2 deadlines, 1 critical, 1 overdue");
  assert.ok(weekly.html.includes('<html lang="en">'));
  assert.ok(weekly.html.includes("Weekly summary."));
  assert.ok(weekly.html.includes("2 deadlines this week, 1 of them critical."));
  assert.ok(weekly.html.includes("One overdue deadline is not marked as done."));
  assert.ok(weekly.html.includes("Wednesday") === false && weekly.html.includes("Friday"));
  assert.ok(weekly.html.includes("Unsubscribe"));
  assert.ok(weekly.text.includes("Open") === false);
  assert.ok(weekly.text.includes("Unsubscribe: https://u"));

  const daily = renderDigestEmail({
    frequency: "napi",
    content: collectDigest({ ...base, frequency: "napi" }),
    now: NOW, appUrl: APP, unsubscribeUrl: "https://u", locale: "en",
  });
  assert.equal(daily.subject, "Daily summary: 1 deadline today, 1 overdue");
  assert.ok(daily.html.includes("Monday, 5 Oct"));
  assert.ok(daily.html.includes("Rest of the week"));
  assert.ok(daily.html.includes("2 h left"));
  assert.equal(formatDigestDue(new Date("2026-10-07T21:59:00.000Z"), "en"), "7 Oct (Wed) 23:59");
});

test("auth mails come in both languages", () => {
  const hu = renderAuthEmail("magic", "https://l/x");
  const en = renderAuthEmail("magic", "https://l/x", "en");
  assert.equal(hu.subject, "Belépő link");
  assert.equal(en.subject, "Sign-in link");
  assert.ok(en.html.includes('<html lang="en">'));
  assert.ok(en.text.includes("Sign in: https://l/x"));
  assert.ok(en.html.includes("If the button does not work"));
});

// ---- account language ----

function setup(locale: Locale) {
  const mails: OutgoingEmail[] = [];
  const store = createMemoryAccountStore();
  const deps = (l: Locale = locale): AuthDeps => ({
    store, send: async (m) => (mails.push(m), true), now: () => NOW, appUrl: APP, ip: "1.1.1.1", locale: l,
  });
  return { store, mails, deps };
}

const PW = "correct horse battery";

async function confirm(s: ReturnType<typeof setup>, d: AuthDeps) {
  const url = new URL(s.mails.at(-1)!.text.match(/https:\/\/\S+/)![0]);
  const result = await consumeLink(d, url.searchParams.get("m") as never, url.searchParams.get("t")!);
  assert.ok(!isAuthError(result));
  return result;
}

test("registration stores the cookie language, not explicit; the mail is in it", async () => {
  const s = setup("en");
  assert.ok(!isAuthError(await register(s.deps(), "anna@x.hu", PW)));
  assert.equal(s.mails[0].subject, "Confirm your email address");
  const user = (await s.store.getUser((await s.store.userIdByEmail("anna@x.hu"))!))!;
  assert.equal(user.locale, "en");
  assert.equal(user.localeExplicit, false);
});

test("sign-in: a non-explicit account follows the browser, an explicit one wins", async () => {
  const s = setup("en");
  await register(s.deps(), "anna@x.hu", PW);
  const confirmed = await confirm(s, s.deps());
  assert.ok(!isAuthError(confirmed));
  const id = (await s.store.userIdByEmail("anna@x.hu"))!;

  // A Hungarian browser signs in: the account follows (not explicit yet).
  const first = await login(s.deps("hu"), "anna@x.hu", PW);
  assert.ok(!isAuthError(first));
  if (!isAuthError(first)) assert.equal(first.locale, "hu");
  assert.equal((await s.store.getUser(id))?.locale, "hu");

  // The user picks English themselves: it is now the account's choice.
  await setAccountLocale(s.deps("hu"), (await s.store.getUser(id))!, "en");
  const stored = await s.store.getUser(id);
  assert.equal(stored?.locale, "en");
  assert.equal(stored?.localeExplicit, true);

  // A Hungarian browser signs in again: the explicit choice sets the cookie, the account stays.
  const second = await login(s.deps("hu"), "anna@x.hu", PW);
  assert.ok(!isAuthError(second));
  if (!isAuthError(second)) assert.equal(second.locale, "en");
  assert.equal((await s.store.getUser(id))?.locale, "en");
});

test("accounts without a stored language default to Hungarian", () => {
  assert.equal(userLocale({}), "hu");
  assert.equal(userLocale(null), "hu");
  assert.equal(userLocale({ locale: "en" }), "en");
});

test("requestLocale reads the cookie, then Accept-Language", () => {
  const req = (headers: Record<string, string>) => new Request("https://x.test/", { headers });
  assert.equal(requestLocale(req({ cookie: "a=b; hr_lang=hu" })), "hu");
  assert.equal(requestLocale(req({ cookie: "hr_lang=en", "accept-language": "hu" })), "en");
  assert.equal(requestLocale(req({ cookie: "hr_lang=de", "accept-language": "hu-HU,en;q=0.5" })), "hu");
  assert.equal(requestLocale(req({})), pickLocale(null));
});

test("auth errors are answered in the request language with a stable code", async () => {
  const s = setup("en");
  const result = await login(s.deps(), "nobody@x.hu", PW);
  assert.ok(isAuthError(result));
  if (!isAuthError(result)) return;
  assert.equal(result.error, "Hibás email cím vagy jelszó"); // service text stays Hungarian
  const en = await authErrorResponse(result, "en").json();
  assert.deepEqual(en, { error: "Incorrect email address or password", code: "bad_credentials" });
  assert.equal((await authErrorResponse(result, "hu").json()).error, "Hibás email cím vagy jelszó");
});

// ---- pure libs ----

test("quick add understands English next to Hungarian", () => {
  const courses = [makeCourse("c1", "Analysis")];
  // Monday 2026-10-05
  const essay = parseQuickDeadline("Essay next tuesday 10:00 !", [], NOW);
  assert.equal(essay.title, "Essay");
  assert.equal(essay.critical, true);
  assert.equal(essay.due?.getDate(), 13);
  assert.equal(essay.due?.getHours(), 10);

  const quiz = parseQuickDeadline("Quiz tomorrow", [], NOW);
  assert.equal(quiz.title, "Quiz");
  assert.equal(quiz.due?.getDate(), 6);
  assert.equal(quiz.due?.getHours(), 23);

  const lab = parseQuickDeadline("Lab report in 3 days", [], NOW);
  assert.equal(lab.title, "Lab report");
  assert.equal(lab.due?.getDate(), 8);

  const dayAfter = parseQuickDeadline("Essay day after tomorrow at 3pm", [], NOW);
  assert.equal(dayAfter.title, "Essay");
  assert.equal(dayAfter.due?.getDate(), 7);
  assert.equal(dayAfter.due?.getHours(), 15);

  assert.equal(parseQuickDeadline("Midterm friday analysis", courses, NOW).courseId, "c1");
  assert.equal(parseQuickDeadline("Report 15 oct", [], NOW).due?.getMonth(), 9);
  assert.equal(parseQuickDeadline("Report Oct 15th", [], NOW).due?.getDate(), 15);
  assert.equal(parseQuickDeadline("Report in two weeks", [], NOW).due?.getDate(), 19);
  // Hungarian still works.
  const hu = parseQuickDeadline("ZH jövő kedd 10:00 !", [], NOW);
  assert.equal(hu.title, "ZH");
  assert.equal(hu.due?.getDate(), 13);
});

test("week labels, notification text and search titles follow the locale", () => {
  const d = makeDeadline({ id: "a", title: "Essay", due: "2026-10-06T07:00:00.000Z", critical: true });
  assert.equal(groupByWeek([d], NOW)[0].label, "Ez a hét");
  assert.equal(groupByWeek([d], NOW, "en")[0].label, "This week");
  const next = makeDeadline({ id: "b", due: "2026-10-14T10:00:00.000Z" });
  assert.equal(groupByWeek([next], NOW, "en")[0].label, "Next week");

  const prefs = { enabled: true, leadMinutes: [1440], criticalOnly: false };
  const [hu] = dueNotifications([d], [], prefs, new Set(), NOW);
  const [en] = dueNotifications([d], [], prefs, new Set(), NOW, "en");
  assert.ok(hu.body.startsWith("Lejár "));
  assert.ok(en.body.startsWith("Due in "), en.body);

  const input = { courses: [], deadlines: [], customPlatforms: [], feeds: [] };
  assert.equal(buildSearchItems(input)[1].title, "Határidők");
  assert.equal(buildSearchItems({ ...input, locale: "en" })[1].title, "Deadlines");
});

test("an untitled event keeps its key whatever the display wording", () => {
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "DTSTART:20261008T100000Z", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const hu = parseIcs(ics);
  const en = parseIcs(ics, "(untitled)");
  assert.equal(hu[0].summary, UNTITLED);
  assert.equal(en[0].summary, "(untitled)");
  assert.equal(hu[0].uid, en[0].uid);
});

test("the privacy notice exists in both languages and names the language data and both cookies", () => {
  const hu = privacyContent("hu");
  const en = privacyContent("en");
  assert.equal(hu.translationNote, undefined);
  assert.ok(en.translationNote?.includes("Hungarian text is the authoritative"));
  assert.equal(hu.purposes.items.length, en.purposes.items.length);
  for (const c of [hu, en]) {
    assert.ok(c.cookies.text.includes("hr_session"));
    assert.ok(c.cookies.text.includes("hr_lang"));
  }
  assert.ok(en.purposes.items.some((p) => p.what === "Language preference"));
  assert.ok(hu.purposes.items.some((p) => p.what === "Nyelvbeállítás"));
});

test("formatRelative gives the largest whole unit, short, in both languages", () => {
  const now = new Date("2026-10-11T12:00:00Z");
  const at = (ms: number) => new Date(now.getTime() + ms);
  const MIN = 60_000;
  const H = 60 * MIN;
  const D = 24 * H;
  assert.equal(formatRelative(at(20_000), now, "hu"), "most");
  assert.equal(formatRelative(at(25 * MIN), now, "hu"), "25 perc múlva");
  assert.equal(formatRelative(at(6 * H + 10 * MIN), now, "hu"), "6 óra múlva");
  assert.equal(formatRelative(at(2 * D), now, "hu"), "2 nap múlva");
  assert.equal(formatRelative(at(-3 * H), now, "hu"), "3 óra ezelőtt");
  assert.equal(formatRelative(at(6 * H), now, "en"), "in 6 h");
  assert.equal(formatRelative(at(1 * D), now, "en"), "in 1 day");
  assert.equal(formatRelative(at(-2 * D), now, "en"), "2 days ago");
  assert.equal(formatRelative(at(90 * D), now, "en"), "in 3 months");
});
