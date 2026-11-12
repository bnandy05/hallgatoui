import { Redis } from "@upstash/redis";
import { createRedisKv } from "@/lib/server/kv";
import type {
  AccountStore,
  DataDoc,
  StoredSession,
  StoredToken,
  StoredUser,
} from "@/lib/server/account/store";
import { dataKey, dataSemesterKey, dataVersionKey, emailKey, sessionKey, tokenKey, userKey, userSessionsKey } from "@/lib/server/account/keys";

// Upstash Redis AccountStore. Server-only.

/** The Vercel Marketplace may inject either pair of variable names (as in lib/server/kv.ts). */
export function redisCredentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

// Keys: data, version, semester. Arguments: base version, new JSON document, new semester.
// Returns the new version, -1 on conflict, or -2 if the client would erase an archived semester.
const CAS_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[2]) or '0')
if current ~= tonumber(ARGV[1]) then return -1 end
local previousTerm = tonumber(redis.call('GET', KEYS[3]) or '0')
local term = tonumber(ARGV[3])
if term < previousTerm then return -2 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], tostring(current + 1))
if term > previousTerm then redis.call('SET', KEYS[3], ARGV[3]) end
return current + 1
`;

export function createRedisAccountStore(url: string, token: string): AccountStore {
  const redis = new Redis({ url, token });
  const kv = createRedisKv(url, token);

  return {
    kv,
    async getUser(id) {
      return (await redis.get<StoredUser>(userKey(id))) ?? null;
    },
    async putUser(user, ttlSeconds) {
      // A plain SET also clears an earlier expiry.
      if (ttlSeconds === undefined) await redis.set(userKey(user.id), user);
      else await redis.set(userKey(user.id), user, { ex: ttlSeconds });
    },
    async deleteUser(id) {
      await redis.del(userKey(id));
    },
    async claimEmail(email, userId, ttlSeconds) {
      const options = ttlSeconds === undefined ? { nx: true as const } : { nx: true as const, ex: ttlSeconds };
      return (await redis.set(emailKey(email), userId, options)) === "OK";
    },
    async setEmailExpiry(email, ttlSeconds) {
      if (ttlSeconds === undefined) await redis.persist(emailKey(email));
      else await redis.expire(emailKey(email), ttlSeconds);
    },
    async userIdByEmail(email) {
      const id = await redis.get<string>(emailKey(email));
      return id ? String(id) : null;
    },
    async releaseEmail(email) {
      await redis.del(emailKey(email));
    },
    async putSession(hash: string, s: StoredSession, ttlSeconds: number) {
      await redis.set(sessionKey(hash), s, { ex: ttlSeconds });
      await redis.sadd(userSessionsKey(s.userId), hash);
    },
    async getSession(hash) {
      return (await redis.get<StoredSession>(sessionKey(hash))) ?? null;
    },
    async deleteSession(hash) {
      const s = await redis.getdel<StoredSession>(sessionKey(hash));
      if (s) await redis.srem(userSessionsKey(s.userId), hash);
    },
    async deleteUserSessions(userId, exceptHash) {
      const hashes = (await redis.smembers(userSessionsKey(userId))).map(String);
      const doomed = hashes.filter((h) => h !== exceptHash);
      if (doomed.length === 0) return;
      await redis.del(...doomed.map(sessionKey));
      await redis.srem(userSessionsKey(userId), ...doomed);
    },
    async putToken(hash: string, t: StoredToken, ttlSeconds: number) {
      await redis.set(tokenKey(hash), t, { ex: ttlSeconds });
    },
    async takeToken(hash) {
      return (await redis.getdel<StoredToken>(tokenKey(hash))) ?? null;
    },
    async getDataVersion(userId) {
      return Number((await redis.get(dataVersionKey(userId))) ?? 0);
    },
    async getData(userId) {
      return (await redis.get<DataDoc>(dataKey(userId))) ?? null;
    },
    async casData(userId, baseVersion, next) {
      const doc: DataDoc = { ...next, version: baseVersion + 1 };
      const result = Number(
        await redis.eval(
          CAS_SCRIPT,
          [dataKey(userId), dataVersionKey(userId), dataSemesterKey(userId)],
          [String(baseVersion), JSON.stringify(doc), String(doc.data.semesterNumber ?? 0)]
        )
      );
      if (result === -2) return { ok: false, current: null, staleSemester: true };
      if (result < 0) {
        return { ok: false, current: (await redis.get<DataDoc>(dataKey(userId))) ?? null };
      }
      return { ok: true, version: result };
    },
    async deleteData(userId) {
      await redis.del(dataKey(userId), dataVersionKey(userId), dataSemesterKey(userId));
    },
  };
}
