import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAccountStore } from "@/lib/server/account/memoryStore";
import type { AccountStore, StoredSession } from "@/lib/server/account/store";
import { DEFAULT_EXPORT_OPTIONS } from "@/lib/ical/export";
import { emptyAppData } from "./helpers";

// Contract suite: any AccountStore implementation (memory, Redis, a future Postgres) must pass.
export function runAccountStoreContract(make: () => AccountStore) {
  const next = () => ({ updatedAt: "2026-10-05T00:00:00.000Z", data: emptyAppData(), exportOptions: DEFAULT_EXPORT_OPTIONS });
  const session = (userId: string): StoredSession => ({ userId, createdAt: "x", lastSeenAt: "x" });

  test("claimEmail is insert-if-absent", async () => {
    const store = make();
    assert.equal(await store.claimEmail("a@x.hu", "u1"), true);
    assert.equal(await store.claimEmail("a@x.hu", "u2"), false);
    assert.equal(await store.userIdByEmail("a@x.hu"), "u1");
    await store.releaseEmail("a@x.hu");
    assert.equal(await store.userIdByEmail("a@x.hu"), null);
  });

  test("takeToken returns the token once", async () => {
    const store = make();
    await store.putToken("h", { purpose: "magic", userId: "u1", expiresAt: "x" }, 60);
    assert.equal((await store.takeToken("h"))?.userId, "u1");
    assert.equal(await store.takeToken("h"), null);
  });

  test("casData: first write wins, stale base conflicts with the stored doc", async () => {
    const store = make();
    assert.equal(await store.getDataVersion("u1"), 0);
    assert.deepEqual(await store.casData("u1", 0, next()), { ok: true, version: 1 });
    const stale = await store.casData("u1", 0, next());
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.current?.version, 1);
    assert.deepEqual(await store.casData("u1", 1, next()), { ok: true, version: 2 });
    assert.equal(await store.getDataVersion("u1"), 2);
    assert.equal((await store.getData("u1"))?.version, 2);
    await store.deleteData("u1");
    assert.equal(await store.getData("u1"), null);
    assert.equal(await store.getDataVersion("u1"), 0);
  });

  test("concurrent casData with the same base: exactly one wins", async () => {
    const store = make();
    const results = await Promise.all([store.casData("u1", 0, next()), store.casData("u1", 0, next())]);
    assert.equal(results.filter((r) => r.ok).length, 1);
  });

  test("deleteUserSessions keeps only the excepted one", async () => {
    const store = make();
    for (const h of ["a", "b", "c"]) await store.putSession(h, session("u1"), 60);
    await store.deleteUserSessions("u1", "b");
    assert.equal(await store.getSession("a"), null);
    assert.ok(await store.getSession("b"));
    assert.equal(await store.getSession("c"), null);
    await store.deleteSession("b");
    assert.equal(await store.getSession("b"), null);
    assert.deepEqual(await store.kv.smembers("usess:u1"), []);
  });

  test("getDataVersion of an unknown user is 0", async () => {
    assert.equal(await make().getDataVersion("nobody"), 0);
  });
}

runAccountStoreContract(createMemoryAccountStore);
