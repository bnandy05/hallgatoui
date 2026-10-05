import { test } from "node:test";
import assert from "node:assert/strict";
import { hasAppData, resolveStartupData } from "@/lib/sync/startup";
import { emptyAppData, makeCourse } from "./helpers";

test("empty server + own cache with data: upload", () => {
  assert.deepEqual(resolveStartupData({ userId: "u1", cacheOwner: "u1", cacheHasData: true, serverVersion: 0 }), { kind: "upload-local" });
});

test("empty server + unowned cache with data (pre-account data): upload", () => {
  assert.deepEqual(resolveStartupData({ userId: "u1", cacheOwner: null, cacheHasData: true, serverVersion: 0 }), { kind: "upload-local" });
});

test("empty server + another user's cache: use the server", () => {
  assert.deepEqual(resolveStartupData({ userId: "u1", cacheOwner: "u2", cacheHasData: true, serverVersion: 0 }), { kind: "use-server" });
});

test("server has data: use the server", () => {
  assert.deepEqual(resolveStartupData({ userId: "u1", cacheOwner: "u1", cacheHasData: true, serverVersion: 3 }), { kind: "use-server" });
});

test("empty server + empty cache: use the server", () => {
  assert.deepEqual(resolveStartupData({ userId: "u1", cacheOwner: "u1", cacheHasData: false, serverVersion: 0 }), { kind: "use-server" });
});

test("hasAppData", () => {
  assert.equal(hasAppData(emptyAppData()), false);
  assert.equal(hasAppData({ ...emptyAppData(), courses: [makeCourse("c", "A")] }), true);
});
