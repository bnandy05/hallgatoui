import { createMemoryKv, type Kv } from "@/lib/server/kv";
import type {
  AccountStore,
  DataDoc,
  StoredSession,
  StoredToken,
  StoredUser,
} from "@/lib/server/account/store";
import { dataKey, dataVersionKey, emailKey, sessionKey, tokenKey, userKey, userSessionsKey } from "@/lib/server/account/keys";

// In-memory AccountStore for dev without Redis and for tests. Server-only.

/** Builds the store over a kv. Compound operations are serialised so they stay atomic. */
export function createMemoryAccountStoreOver(kv: Kv): AccountStore {
  let chain: Promise<unknown> = Promise.resolve();
  function atomically<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  }

  return {
    kv,
    getUser: (id) => kv.get<StoredUser>(userKey(id)),
    putUser: (user) => kv.set(userKey(user.id), user),
    deleteUser: (id) => kv.del(userKey(id)),
    claimEmail: (email, userId) =>
      atomically(async () => {
        if (await kv.get(emailKey(email))) return false;
        await kv.set(emailKey(email), userId);
        return true;
      }),
    userIdByEmail: (email) => kv.get<string>(emailKey(email)),
    releaseEmail: (email) => kv.del(emailKey(email)),
    async putSession(hash: string, s: StoredSession, ttlSeconds: number) {
      await kv.set(sessionKey(hash), s, ttlSeconds);
      await kv.sadd(userSessionsKey(s.userId), hash);
    },
    getSession: (hash) => kv.get<StoredSession>(sessionKey(hash)),
    async deleteSession(hash) {
      const s = await kv.get<StoredSession>(sessionKey(hash));
      await kv.del(sessionKey(hash));
      if (s) await kv.srem(userSessionsKey(s.userId), hash);
    },
    async deleteUserSessions(userId, exceptHash) {
      for (const hash of await kv.smembers(userSessionsKey(userId))) {
        if (hash === exceptHash) continue;
        await kv.del(sessionKey(hash));
        await kv.srem(userSessionsKey(userId), hash);
      }
    },
    putToken: (hash: string, t: StoredToken, ttlSeconds: number) => kv.set(tokenKey(hash), t, ttlSeconds),
    takeToken: (hash) =>
      atomically(async () => {
        const token = await kv.get<StoredToken>(tokenKey(hash));
        if (token) await kv.del(tokenKey(hash));
        return token;
      }),
    async getDataVersion(userId) {
      return (await kv.get<number>(dataVersionKey(userId))) ?? 0;
    },
    getData: (userId) => kv.get<DataDoc>(dataKey(userId)),
    casData: (userId, baseVersion, next) =>
      atomically(async () => {
        const current = (await kv.get<number>(dataVersionKey(userId))) ?? 0;
        if (current !== baseVersion) {
          return { ok: false as const, current: await kv.get<DataDoc>(dataKey(userId)) };
        }
        const version = baseVersion + 1;
        await kv.set(dataKey(userId), { ...next, version });
        await kv.set(dataVersionKey(userId), version);
        return { ok: true as const, version };
      }),
    async deleteData(userId) {
      await kv.del(dataKey(userId), dataVersionKey(userId));
    },
  };
}

/** A fully fresh store with its own state (tests). */
export function createMemoryAccountStore(): AccountStore {
  return createMemoryAccountStoreOver(createMemoryKv());
}
