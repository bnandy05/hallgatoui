// Run against a dev server using REQUIREMENT_TEST_URL; account requests are isolated fixtures.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const { chromium } = createRequire(import.meta.url)("playwright");
const origin = process.env.REQUIREMENT_TEST_URL ?? "http://127.0.0.1:3010";
const shots = process.env.REQUIREMENT_SCREENSHOTS;
const now = new Date("2026-11-18T14:00:00Z");
const options = { includeDone: false, alarms: true, weeklySummary: true, studyBlocks: true, dedupe: true, includeClasses: true, gradeInfo: true };
const course = (id, kind) => ({ id, name: `Analízis I ${kind}`, kind, code: `IP-18AN1${kind === "Ea" ? "E 1" : "G 4"}`, semester: "2026/27/1", color: "#2b5b84", links: [], resources: [], matchKeywords: [], createdAt: "2026-09-01T00:00:00Z" });
const rules = (courseId) => ({ id: `rules:${courseId}`, courseId, source: "manual", schemaVersion: 1,
  components: [{ id: "jelen", label: "Practice attendance", kind: "attendance", limit: { maxAbsences: 3, countExcused: true, onExceed: "none" } }, { id: "zh", label: "ZH", kind: "exam", scale: { kind: "points", max: 100 } }],
  derived: [], retakes: [], flags: [], tables: [], outcomes: [
    { id: "gyak", label: "Practical grade", kind: "gyakorlat", select: "first", paths: [{ id: "alap", label: "ZH", grade: "if(zh >= 50, 4, 1)" }] },
    { id: "ajanlott", label: "Offered exam grade", kind: "megajanlott", select: "first", paths: [{ id: "alap", label: "Practice", grade: "grade(gyak)" }] },
  ] });
const result = (courseId, points) => ({ id: `${courseId}|zh|n:1`, courseId, componentId: "zh", instanceKey: "n:1", state: "recorded", value: { kind: "points", points } });
const seed = () => ({ version: 1, courses: [course("ea", "Ea"), course("gy", "Gy")], deadlines: [], feeds: [], customPlatforms: [], ignoredDuplicatePairs: [],
  classSessions: ["ea", "gy"].map((courseId) => ({ id: `s-${courseId}`, externalUid: `uid-${courseId}`, sourceId: "source", courseId, kind: "ora", subject: `Analízis ${courseId}`, subjectKey: `analizis ${courseId}`, group: courseId === "gy" ? "4" : "1", teachers: [], start: "2026-11-18T08:00:00Z", end: "2026-11-18T09:30:00Z" })),
  timetableSources: [{ id: "source", name: "Test timetable", importedAt: "2026-09-01T00:00:00Z", subjectCourses: { "analizis ea": "ea", "analizis gy": "gy" } }],
  requirementRules: [rules("ea"), rules("gy")], requirementResults: [result("ea", 60), result("gy", 80)], attendancePrefs: { enabled: false, since: "2026-11-17T00:00:00Z" } });
async function until(check) {
  for (let n = 0; n < 120; n++) { if (await check()) return; await new Promise((r) => setTimeout(r, 100)); }
  assert.fail("Timed out waiting for shared requirement data");
}
async function setup(browser, initial) {
  const context = await browser.newContext({ locale: "en-GB", timezoneId: "Europe/Budapest", reducedMotion: "reduce", serviceWorkers: "block" });
  await context.addCookies([{ name: "hr_session", value: "requirements-browser-test", url: origin }, { name: "hr_lang", value: "en", url: origin }]);
  let saved = initial; let version = 1;
  const queries = [];
  await context.route("**/api/fiok", (route) => route.fulfill({ json: { user: { id: "requirement-user", email: "requirements@example.test", hasPassword: true } } }));
  await context.route("**/api/adatok*", async (route) => {
    if (route.request().method() === "PUT") { saved = route.request().postDataJSON().data; version++; return route.fulfill({ json: { version } }); }
    return route.fulfill({ json: { version, data: saved, exportOptions: options } });
  });
  await context.route("**/api/kovetelmeny/sablon*", (route) => { queries.push(new URL(route.request().url()).searchParams.getAll("kod")); return route.fulfill({ json: { university: "elte", offers: [] } }); });
  const page = await context.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: now });
  return { context, page, saved: () => saved, queries, errors };
}

test("join populated Ea/Gy trackers, resolve conflicts, edit from either page, preserve attendance and reload", { timeout: 120_000 }, async (t) => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH }); t.after(() => browser.close());
  const h = await setup(browser, seed()); const { page } = h;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/targy/ea#course-requirements`);
  await page.getByRole("button", { name: "Connected courses and rules", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Shared requirement system", exact: true });
  await dialog.getByRole("checkbox", { name: /Analízis I Gy/ }).check();
  await dialog.getByLabel("Applies to: Practice attendance", { exact: true }).selectOption("gy");
  await dialog.getByLabel("Applies to: ZH", { exact: true }).selectOption("gy");
  const save = dialog.getByRole("button", { name: "Save connections", exact: true });
  assert.equal(await save.isEnabled(), false);
  await dialog.getByLabel("Choose a result: zh n:1", { exact: true }).selectOption("gy|zh|n:1");
  assert.equal(await save.isEnabled(), true);
  assert.ok(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth));
  if (shots) { await mkdir(shots, { recursive: true }); await dialog.screenshot({ path: `${shots}/setup-mobile.png` }); }
  await save.click();
  await until(() => h.saved().requirementRules.length === 1 && h.saved().requirementResults.some((r) => r.id === "ea|zh|n:1" && r.value?.points === 80));
  assert.deepEqual(h.saved().requirementRules[0].courseIds, ["ea", "gy"]);
  assert.equal(h.saved().requirementRules[0].previousSystems.length, 2);
  await page.getByRole("button", { name: "All results", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "ZH", exact: true }).inputValue(), "80");
  await page.goto(`${origin}/targy/gy#course-requirements`);
  const score = page.getByRole("textbox", { name: "ZH", exact: true });
  await score.fill("75"); await score.press("Tab");
  await until(() => h.saved().requirementResults.some((r) => r.id === "ea|zh|n:1" && r.value?.points === 75));
  assert.equal(h.saved().requirementResults.filter((r) => r.componentId === "zh").length, 1);
  const attendance = page.getByRole("region", { name: "Attendance", exact: true });
  await attendance.getByRole("button", { name: "Absent", exact: true }).first().click();
  await attendance.getByText("1 / 3 absences", { exact: true }).waitFor();
  await until(() => h.saved().requirementResults.some((r) => r.id === "ea|jelen|s:uid-gy"));
  await page.getByRole("heading", { name: "Shared requirement system", exact: true }).scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  if (shots) await page.screenshot({ path: `${shots}/shared-mobile.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("heading", { name: "Shared requirement system", exact: true }).scrollIntoViewIfNeeded();
  if (shots) await page.screenshot({ path: `${shots}/shared-desktop.png` });
  await page.goto(`${origin}/targy/ea#course-requirements`);
  await page.getByRole("button", { name: "All results", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "ZH", exact: true }).inputValue(), "75");
  await page.getByText("Previous requirement systems and results", { exact: true }).click();
  assert.equal(await page.locator('details').filter({ has: page.getByText("Previous requirement systems and results", { exact: true }) }).count(), 1);
  const lectureAttendance = page.getByRole("region", { name: "Attendance", exact: true });
  await lectureAttendance.getByText("0 absences", { exact: true }).waitFor();
  assert.equal(await lectureAttendance.getByText("1 / 3 absences", { exact: true }).count(), 0);
  await page.reload();
  await page.getByRole("button", { name: "All results", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "ZH", exact: true }).inputValue(), "75");
  await until(() => h.queries.some((codes) => codes.includes("IP-18AN1E") && codes.includes("IP-18AN1G")));
  assert.deepEqual(h.errors, []);
});

test("new document rules go through scope review before being saved for both courses", { timeout: 120_000 }, async (t) => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH }); t.after(() => browser.close());
  const initial = seed(); initial.requirementRules = []; initial.requirementResults = [];
  const h = await setup(browser, initial); const { page } = h;
  await page.goto(`${origin}/targy/ea#course-requirements`);
  await page.getByRole("button", { name: "Own rules (JSON)", exact: true }).click();
  const data = rules("ea"); const subject = Object.fromEntries(Object.entries(data).filter(([key]) => !["id", "courseId", "source"].includes(key)));
  await page.getByRole("dialog").getByRole("textbox").fill(JSON.stringify(subject));
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Shared requirement system", exact: true });
  await review.getByRole("checkbox", { name: /Analízis I Gy/ }).check();
  assert.equal(await review.getByLabel("Applies to: Practice attendance", { exact: true }).inputValue(), "");
  await review.getByLabel("Applies to: Practice attendance", { exact: true }).selectOption("gy");
  await review.getByLabel("Applies to: ZH", { exact: true }).selectOption("gy");
  await review.getByRole("button", { name: "Save connections", exact: true }).click();
  await until(() => h.saved().requirementRules.length === 1 && h.saved().requirementRules[0].courseIds?.includes("gy"));
  await page.goto(`${origin}/targy/gy#course-requirements`);
  await page.getByRole("textbox", { name: "ZH", exact: true }).waitFor();
  assert.deepEqual(h.errors, []);
});
