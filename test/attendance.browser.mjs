// Run against a local dev server: ATTENDANCE_TEST_URL=http://127.0.0.1:3010 node --test test/attendance.browser.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const { chromium } = createRequire(import.meta.url)("playwright");
const origin = process.env.ATTENDANCE_TEST_URL ?? "http://127.0.0.1:3010";
const screenshots = process.env.ATTENDANCE_SCREENSHOTS;
const now = new Date("2026-11-18T14:00:00Z");
const options = { includeDone: false, alarms: true, weeklySummary: true, studyBlocks: true, dedupe: true, includeClasses: true, gradeInfo: true };
const course = { id: "attendance-test", name: "Discrete Mathematics", color: "#2b5b84", links: [], resources: [], matchKeywords: [], createdAt: "2026-09-01T00:00:00Z" };
const session = (uid, start, end, group = "Practice") => ({ id: uid, externalUid: uid, sourceId: "test-source", courseId: course.id, kind: "ora", subject: "Discrete Mathematics", subjectKey: "discrete mathematics", group, teachers: [], start, end });
const seed = () => ({ version: 1, courses: [course], deadlines: [], feeds: [], customPlatforms: [], ignoredDuplicatePairs: [],
  classSessions: [session("old", "2026-09-01T08:00:00Z", "2026-09-01T09:30:00Z"), session("today", "2026-11-18T08:00:00Z", "2026-11-18T09:30:00Z"), session("next", "2026-11-19T08:00:00Z", "2026-11-19T09:30:00Z")],
  timetableSources: [{ id: "test-source", name: "Test timetable", importedAt: "2026-09-01T00:00:00Z", subjectCourses: { "discrete mathematics": course.id } }],
  requirementRules: [], requirementResults: [], attendancePrefs: { enabled: true, since: "2026-11-17T00:00:00Z" } });

async function until(check) {
  for (let n = 0; n < 100; n++) { if (await check()) return; await new Promise((r) => setTimeout(r, 100)); }
  assert.fail("Timed out waiting for saved attendance");
}

test("attendance check-in, undo, limits, history, calendar, settings, and reload", { timeout: 120_000 }, async (t) => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH });
  t.after(() => browser.close());
  const context = await browser.newContext({ locale: "en-GB", timezoneId: "Europe/Budapest", reducedMotion: "reduce", serviceWorkers: "block" });
  await context.addCookies([{ name: "hr_session", value: "attendance-browser-test", url: origin }, { name: "hr_lang", value: "en", url: origin }]);
  let saved = seed(); let version = 1;
  await context.route("**/api/fiok", (route) => route.fulfill({ json: { user: { id: "attendance-browser-user", email: "attendance@example.test", hasPassword: true } } }));
  await context.route("**/api/adatok*", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON(); saved = body.data; version++;
      return route.fulfill({ json: { version } });
    }
    return route.fulfill({ json: { version, data: saved, exportOptions: options } });
  });
  await context.route("**/api/fiok/**", (route) => route.fulfill({ json: { available: false } }));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: now });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin);
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Were you at this class?").waitFor();
  assert.equal(await dialog.getByRole("button", { name: "Absent", exact: true }).count(), 1);
  if (screenshots) { await mkdir(screenshots, { recursive: true }); await page.screenshot({ path: `${screenshots}/checkin-mobile.png`, fullPage: true }); }
  await dialog.getByRole("button", { name: "Absent", exact: true }).click();
  await dialog.getByText("1 absence", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await dialog.getByText("0 absences", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Absent", exact: true }).click();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("link", { name: "Attendance and absences" }).click();
  const attendance = page.getByRole("region", { name: "Attendance", exact: true });
  await attendance.getByText("1 absence", { exact: true }).waitFor();
  await attendance.getByRole("button", { name: "Set absence limit" }).click();
  assert.equal(await attendance.getByLabel("Allowed absences").inputValue(), "3");
  await attendance.getByRole("button", { name: "Save", exact: true }).click();
  await attendance.getByText("1 / 3 absences").waitFor();
  await attendance.getByText("1 class still unrecorded").waitFor();
  // A class can be corrected from dated history without opening requirements.
  await attendance.getByRole("listitem").first().getByRole("button", { name: "Present", exact: true }).click();
  await attendance.getByText("0 / 3 absences").waitFor();
  await attendance.getByRole("listitem").first().getByText("More options").click();
  await attendance.getByRole("button", { name: "Class cancelled", exact: true }).first().click();
  await attendance.getByText("Class cancelled", { exact: true }).first().waitFor();
  await attendance.getByRole("button", { name: "Add a past class", exact: true }).click();
  await attendance.getByLabel("Class date").fill("2026-11-16");
  await attendance.getByRole("button", { name: "Add a past class", exact: true }).click();
  await attendance.getByRole("listitem").filter({ hasText: "Nov 16" }).getByRole("button", { name: "Absent", exact: true }).click();
  await attendance.getByText("1 / 3 absences").waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  if (screenshots) await attendance.screenshot({ path: `${screenshots}/history-mobile.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (screenshots) await page.screenshot({ path: `${screenshots}/course-desktop.png`, fullPage: true });
  await until(() => saved.requirementResults.some((r) => r.instanceKey.startsWith("m:") && r.value?.status === "unexcused"));
  // A fresh browser tab starts from the saved account data, not the original tab's cache.
  const other = await context.newPage(); await other.clock.install({ time: now });
  await other.goto(`${origin}/targy/${course.id}`);
  await other.getByRole("region", { name: "Attendance", exact: true }).getByText("1 / 3 absences").waitFor();
  await other.close();
  await page.goto(`${origin}/beallitasok#jelenlet`);
  const checkins = page.getByRole("switch", { name: "After-class check-ins" });
  assert.equal(await checkins.getAttribute("aria-checked"), "true");
  await checkins.click();
  await until(() => saved.attendancePrefs.enabled === false);
  await page.reload();
  assert.equal(await checkins.getAttribute("aria-checked"), "false");
  if (screenshots) await page.screenshot({ path: `${screenshots}/settings-desktop.png`, fullPage: true });
  await page.goto(origin);
  // Answer from the week calendar, even with prompts turned off.
  await page.getByRole("button", { name: "Absent", exact: true }).first().click();
  await until(() => saved.requirementResults.some((r) => r.instanceKey === "s:today" && r.value?.status === "unexcused"));
  await page.getByRole("link", { name: "Attendance and absences" }).getByText("2 / 3 absences").waitFor();
  assert.deepEqual(errors, []);
});
