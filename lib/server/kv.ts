import { Redis } from "@upstash/redis";

/**
 * Thin key-value wrapper (JSON values) over Upstash Redis. Without credentials it falls back
 * to an in-memory Map outside production, so local dev works without any setup.
 * Server-only.
 */
export interface Kv {
  get<T>(key: string): Promise<T | null>;
  /** Stores a JSON value that expires after ttlSeconds (omitted: it never expires). */
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /** Replaces a JSON value if it still matches, updating a set index in the same operation. */
  compareAndSet(key: string, previous: unknown, next: unknown, indexKey: string, historyKey: string, term: string): Promise<boolean>;
  /** Resets the expiry of an existing key. */
  expire(key: string, ttlSeconds: number): Promise<void>;
  /** Increments a counter; a new counter expires after ttlSeconds. Returns the new value. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  /** Set membership (no expiry), used as an index of keys to visit. */
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

/** A fully fresh in-memory store (tests); getKv uses a global one that survives reloads. */
export function createMemoryKv(): Kv {
  return buildMemoryKv(new Map(), new Map());
}

function globalMemoryKv(): Kv {
  // Survive dev-server module reloads.
  const g = globalThis as {
    __hallgatoiMemoryKv?: Map<string, MemoryEntry>;
    __hallgatoiMemorySets?: Map<string, Set<string>>;
  };
  return buildMemoryKv(
    (g.__hallgatoiMemoryKv ??= new Map<string, MemoryEntry>()),
    (g.__hallgatoiMemorySets ??= new Map<string, Set<string>>())
  );
}

function buildMemoryKv(store: Map<string, MemoryEntry>, sets: Map<string, Set<string>>): Kv {

  function live(key: string): MemoryEntry | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    async get<T>(key: string) {
      const entry = live(key);
      return entry ? (JSON.parse(entry.value) as T) : null;
    },
    async set(key, value, ttlSeconds) {
      store.set(key, {
        value: JSON.stringify(value),
        expiresAt: ttlSeconds === undefined ? Infinity : Date.now() + ttlSeconds * 1000,
      });
    },
    async del(...keys) {
      for (const key of keys) {
        store.delete(key);
        sets.delete(key);
      }
    },
    async compareAndSet(key, previous, next, indexKey, historyKey, term) {
      if (live(key)?.value !== (previous === null ? undefined : JSON.stringify(previous))) return false;
      if (next === null) store.delete(key);
      else store.set(key, { value: JSON.stringify(next), expiresAt: Infinity });
      const indexed = sets.get(indexKey) ?? new Set<string>();
      const terms = sets.get(historyKey) ?? new Set<string>();
      if (next === null) {
        indexed.delete(key);
        terms.delete(term);
      } else {
        indexed.add(key);
        terms.add(term);
      }
      sets.set(indexKey, indexed);
      sets.set(historyKey, terms);
      return true;
    },
    async expire(key, ttlSeconds) {
      const entry = live(key);
      if (entry) entry.expiresAt = Date.now() + ttlSeconds * 1000;
    },
    async incr(key, ttlSeconds) {
      const entry = live(key);
      const value = (entry ? Number(JSON.parse(entry.value)) : 0) + 1;
      store.set(key, {
        value: JSON.stringify(value),
        expiresAt: entry ? entry.expiresAt : Date.now() + ttlSeconds * 1000,
      });
      return value;
    },
    async sadd(key, member) {
      const set = sets.get(key) ?? new Set<string>();
      set.add(member);
      sets.set(key, set);
    },
    async srem(key, member) {
      sets.get(key)?.delete(member);
    },
    async smembers(key) {
      return [...(sets.get(key) ?? [])];
    },
  };
}

export function createRedisKv(url: string, token: string): Kv {
  const redis = new Redis({ url, token });
  return {
    async get<T>(key: string) {
      return (await redis.get<T>(key)) ?? null;
    },
    async set(key, value, ttlSeconds) {
      if (ttlSeconds === undefined) await redis.set(key, value);
      else await redis.set(key, value, { ex: ttlSeconds });
    },
    async del(...keys) {
      if (keys.length > 0) await redis.del(...keys);
    },
    async compareAndSet(key, previous, next, indexKey, historyKey, term) {
      const result = await redis.eval(
        `if (redis.call('GET', KEYS[1]) or '') ~= ARGV[1] then return 0 end
        if ARGV[2] == '' then
          redis.call('DEL', KEYS[1])
          redis.call('SREM', KEYS[2], KEYS[1])
          redis.call('SREM', KEYS[3], ARGV[3])
        else
          redis.call('SET', KEYS[1], ARGV[2])
          redis.call('SADD', KEYS[2], KEYS[1])
          redis.call('SADD', KEYS[3], ARGV[3])
        end
        return 1`,
        [key, indexKey, historyKey],
        [previous === null ? "" : JSON.stringify(previous), next === null ? "" : JSON.stringify(next), term]
      );
      return Number(result) === 1;
    },
    async expire(key, ttlSeconds) {
      await redis.expire(key, ttlSeconds);
    },
    async incr(key, ttlSeconds) {
      const value = await redis.incr(key);
      if (value === 1) await redis.expire(key, ttlSeconds);
      return value;
    },
    async sadd(key, member) {
      await redis.sadd(key, member);
    },
    async srem(key, member) {
      await redis.srem(key, member);
    },
    async smembers(key) {
      return (await redis.smembers(key)).map(String);
    },
  };
}

let cached: Kv | null | undefined;

/** Returns the store, or null when the server has no storage configured (production only). */
export function getKv(): Kv | null {
  if (cached !== undefined) return cached;
  // The Vercel Marketplace may inject either pair of variable names.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) cached = createRedisKv(url, token);
  else if (process.env.NODE_ENV !== "production") cached = globalMemoryKv();
  else cached = null;
  return cached;
}
