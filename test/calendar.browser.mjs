import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const loadTool = createRequire(import.meta.url);
const { chromium } = loadTool("playwright");
const password = "browser-test-password";
const initialTime = new Date("2026-10-05T10:00:00Z");
const course = "Browser Test Algebra";
const deadline = "Browser test problem set";
const calendarUrl = "https://canvas.example.test/calendar.ics";

async function unusedPort() {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  server.close();
  await once(server, "close");
  return port;
}

async function until(check, timeout = 15_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await delay(100);
  }
  assert.fail("Timed out waiting for the app");
}

async function startApp(t, mode = "dev") {
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [loadTool.resolve("next/dist/bin/next"), mode, "--hostname", "127.0.0.1", "--port", String(port)], {
    env: {
      ...process.env,
      NODE_ENV: mode === "dev" ? "development" : "production",
      NEXT_TELEMETRY_DISABLED: "1",
      APP_URL: origin,
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      KV_REST_API_URL: "",
      KV_REST_API_TOKEN: "",
      RESEND_API_KEY: "",
      DIGEST_FROM: "",
      JEV_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  for (const stream of [server.stdout, server.stderr]) stream.on("data", (chunk) => { output += chunk; });
  async function stop() {
    if (server.exitCode !== null || server.signalCode !== null) return;
    const exited = once(server, "exit");
    server.kill();
    await exited;
  }
  t.after(stop);

  await until(async () => {
    if (server.exitCode !== null) assert.fail(output);
    const response = await fetch(`${origin}/belepes`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    return response?.ok;
  }, 60_000);

  return {
    origin,
    stop,
    async register(email) {
      const response = await fetch(`${origin}/api/fiok/regisztracio`, {
        method: "POST",
        headers: { "content-type": "application/json", "accept-language": "en" },
        body: JSON.stringify({ email, password }),
      });
      assert.ok(response.ok, `Could not register the test account (${response.status})`);
      const confirmation = await until(() => {
        const start = output.indexOf(`${email}:`);
        return start < 0 ? null : output.slice(start).match(/https?:\/\/[^\s]+\/fiok\/link\?[^\s]+/)?.[0];
      });
      const { searchParams } = new URL(confirmation);
      const confirmed = await fetch(`${origin}/api/fiok/link/hasznal`, {
        method: "POST",
        headers: { "content-type": "application/json", "accept-language": "en" },
        body: JSON.stringify({ m: searchParams.get("m"), t: searchParams.get("t") }),
      });
      assert.ok(confirmed.ok, `Could not confirm the test account (${confirmed.status})`);
    },
  };
}

async function signIn(page, origin, email) {
  await page.goto(`${origin}/belepes`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await page.waitForURL(`${origin}/`);
  await page.getByRole("heading", { name: "Connect a calendar" }).waitFor();
}

test("calendar import, refresh, offline sync and semester archiving persist across reloads", { timeout: 180_000 }, async (t) => {
  const app = await startApp(t);
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH });
  t.after(() => browser.close());
  const context = await browser.newContext({ locale: "en-GB", timezoneId: "UTC", reducedMotion: "reduce" });
  const page = await context.newPage();

  const first = "calendar-a@example.test";
  const second = "calendar-b@example.test";
  await app.register(first);
  await app.register(second);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: initialTime });
  await signIn(page, app.origin, first);

  // Supply the response from the external feed. Account authentication and data saves use the real API.
  let due = "2026-10-05T10:02:00Z";
  await page.route("**/api/ical", async (route) => {
    assert.equal(route.request().postDataJSON().url, calendarUrl);
    await route.fulfill({ json: { events: [{
      uid: "event-assignment-1",
      summary: `${deadline} [2026/27/1 TEST-101 - ${course}]`,
      start: due,
      url: "https://canvas.example.test/calendar?include_contexts=course_42#assignment_1",
      categories: [],
    }] } });
  });

  const importForm = page.getByRole("region", { name: "Connect a calendar" });
  assert.ok(await importForm.evaluate((form) => form.scrollWidth <= form.clientWidth));
  await importForm.getByLabel("Calendar link").fill(calendarUrl);
  await importForm.getByRole("button", { name: "Connect a calendar" }).click();
  const nextNotice = page.getByRole("button", { name: new RegExp(`^Next .*${deadline}`) });
  await nextNotice.waitFor();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Save (1 new course)", exact: true }).click();
  await page.getByRole("link", { name: course }).waitFor();

  const data = async () => {
    const response = await context.request.get(`${app.origin}/api/adatok`);
    assert.ok(response.ok);
    return (await response.json()).data;
  };
  await until(async () => {
    const saved = await data();
    const mapped = saved.courses.find((entry) => entry.name === course);
    return mapped && saved.deadlines.some((entry) => entry.title === deadline && entry.courseId === mapped.id);
  });
  await page.reload();
  await nextNotice.waitFor();
  await page.getByRole("link", { name: course }).waitFor();

  await page.clock.fastForward(3 * 60_000);
  await nextNotice.waitFor({ state: "hidden" });
  const overdue = page.getByRole("region", { name: /Overdue/ });
  const done = overdue.getByRole("checkbox", { name: `${deadline}: mark as done` });
  await done.waitFor();

  await context.setOffline(true);
  // Marking it done moves it out of Overdue and changes its accessible name.
  await done.click();
  assert.ok(await page.getByRole("checkbox", { name: `${deadline}: mark as not done` }).isChecked());
  await page.getByRole("status").filter({ hasText: "Offline" }).waitFor();
  due = "2026-10-07T14:00:00Z";
  await page.clock.fastForward(61 * 60_000);
  await context.setOffline(false);
  await until(async () => {
    const saved = (await data()).deadlines.find((entry) => entry.title === deadline);
    return saved?.done && Date.parse(saved.due) === Date.parse(due);
  });

  const savedBeforeRepeat = await data();
  await page.goto(`${app.origin}/beallitasok#naptarak`);
  await page.getByRole("button", { name: "New calendar" }).click();
  const addCalendar = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "New calendar" }) });
  await addCalendar.getByLabel("Calendar link").fill(calendarUrl);
  await addCalendar.getByRole("button", { name: "Add", exact: true }).click();
  await addCalendar.waitFor({ state: "hidden" });
  await until(async () => (await data()).feeds[0]?.lastSyncedAt !== savedBeforeRepeat.feeds[0].lastSyncedAt);
  const repeated = await data();
  assert.deepEqual(repeated.feeds.map((feed) => feed.id), savedBeforeRepeat.feeds.map((feed) => feed.id));
  assert.equal(repeated.deadlines[0].courseId, savedBeforeRepeat.deadlines[0].courseId);
  assert.equal(repeated.deadlines[0].done, true);

  await page.goto(`${app.origin}/targy/${repeated.courses[0].id}`);
  await page.getByRole("button", { name: "Use it", exact: true }).click();
  const score = page.getByRole("textbox", { name: "Elméleti zh (30 kérdés)", exact: true });
  await score.fill("24");
  await score.press("Enter");
  await until(async () => (await data()).requirementResults.some((result) => result.value?.points === 24));

  await page.goto(`${app.origin}/beallitasok#adatok`);
  const archives = page.getByRole("region", { name: "Semester archive" });
  await archives.getByRole("button", { name: "Archive current semester" }).click();
  const archiveForm = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Archive current semester" }) });
  await archiveForm.getByLabel("Semester name").fill("Autumn 2026");
  await archiveForm.getByRole("button", { name: "Archive current semester" }).click();
  await until(async () => (await data()).semesterArchives?.[0]?.name === "Autumn 2026");
  const archived = await data();
  assert.deepEqual(archived.deadlines, []);
  assert.deepEqual(archived.feeds, []);
  assert.equal(archived.semesterArchives[0].data.deadlines[0].done, true);
  assert.equal(archived.semesterArchives[0].data.requirementResults[0].value.points, 24);
  await page.reload();
  await archives.getByText("Autumn 2026", { exact: true }).click();
  await archives.getByText(course, { exact: true }).click();
  await archives.getByText("24 points", { exact: true }).waitFor();
  await page.goto(app.origin);
  await page.getByRole("heading", { name: "Connect a calendar" }).waitFor();

  await page.goto(`${app.origin}/beallitasok#fiok`);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/belepes");
  await signIn(page, app.origin, second);
  assert.equal(await page.getByText(deadline, { exact: true }).count(), 0);
  assert.deepEqual((await data()).deadlines, []);
  assert.equal((await data()).semesterArchives, undefined);
});

test("the production app reopens its cached board offline", { timeout: 120_000 }, async (t) => {
  const { origin, stop } = await startApp(t, "start");
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH });
  t.after(() => browser.close());
  const context = await browser.newContext({ locale: "en-GB", timezoneId: "UTC", reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${origin}/belepes`);
  await page.getByRole("button", { name: "Start the demo" }).click();
  const courses = page.getByRole("region", { name: "Courses", exact: true });
  const courseLink = courses.getByRole("link", { name: /.+/ }).first();
  await courseLink.waitFor();
  const courseName = await courseLink.textContent();
  await page.waitForFunction(async () => !!navigator.serviceWorker.controller && !!(await caches.match(location.origin + "/")));
  await page.reload();
  await courses.getByRole("link", { name: courseName, exact: true }).waitFor();
  await stop();
  await context.setOffline(true);
  await page.reload();
  await courses.getByRole("link", { name: courseName, exact: true }).waitFor();
});
