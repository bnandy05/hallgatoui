import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOCALE, getMessages, isLocale, pickLocale, plural } from "@/lib/i18n";

test("pickLocale: Hungarian only when it is the top-ranked language", () => {
  assert.equal(pickLocale("hu"), "hu");
  assert.equal(pickLocale("hu-HU"), "hu");
  assert.equal(pickLocale("hu-HU,hu;q=0.9,en;q=0.8"), "hu");
  assert.equal(pickLocale("hu;q=0.9,en;q=1"), "en");
  assert.equal(pickLocale("en-US,hu;q=0.8"), "en");
  assert.equal(pickLocale("en,hu"), "en");
  assert.equal(pickLocale("hu,en"), "hu");
  assert.equal(pickLocale("de"), "en");
  assert.equal(pickLocale("*"), "en");
});

test("pickLocale: missing or malformed input falls back to English", () => {
  assert.equal(DEFAULT_LOCALE, "en");
  assert.equal(pickLocale(null), "en");
  assert.equal(pickLocale(undefined), "en");
  assert.equal(pickLocale(""), "en");
  assert.equal(pickLocale(";;,,;q="), "en");
  assert.equal(pickLocale("hu;q=abc"), "en");
  assert.equal(pickLocale("hu;q=0"), "en");
  assert.equal(pickLocale("hux"), "en");
});

test("isLocale, plural and message lookup", () => {
  assert.equal(isLocale("hu"), true);
  assert.equal(isLocale("de"), false);
  assert.equal(isLocale(undefined), false);
  assert.equal(plural(1, "deadline", "deadlines"), "deadline");
  assert.equal(plural(2, "deadline", "deadlines"), "deadlines");
  assert.equal(getMessages("hu").nav.week, "Hét");
  assert.equal(getMessages("en").nav.week, "Week");
  assert.equal(getMessages("en").reminders.titleWithCount(3), "Reminders (3)");
});
