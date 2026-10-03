import { Redis } from "@upstash/redis";

/**
 * Thin key-value wrapper (JSON values) over Upstash Redis. Without credentials it falls back
 * to an in-memory Map outside production, so local dev works without any setup.
 * Server-only.
 */
export interface Kv {
  get<T>(key: string): Promise<T | null>;
  /** Stores a JSON value that expires after ttlSeconds. */
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /** Resets the expiry of an existing key. */
  expire(key: string, ttlSeconds: number): Promise<void>;
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

function createMemoryKv(): Kv {
  // Survive dev-server module reloads.
  const g = globalThis as { __hallgatoiMemoryKv?: Map<string, MemoryEntry> };
  const store = (g.__hallgatoiMemoryKv ??= new Map<string, MemoryEntry>());

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
      store.set(key, { value: JSON.stringify(value), expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    async del(...keys) {
      for (const key of keys) store.delete(key);
    },
    async expire(key, ttlSeconds) {
      const entry = live(key);
      if (entry) entry.expiresAt = Date.now() + ttlSeconds * 1000;
    },
  };
}

function createRedisKv(url: string, token: string): Kv {
  const redis = new Redis({ url, token });
  return {
    async get<T>(key: string) {
      return (await redis.get<T>(key)) ?? null;
    },
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, { ex: ttlSeconds });
    },
    async del(...keys) {
      if (keys.length > 0) await redis.del(...keys);
    },
    async expire(key, ttlSeconds) {
      await redis.expire(key, ttlSeconds);
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
  else if (process.env.NODE_ENV !== "production") cached = createMemoryKv();
  else cached = null;
  return cached;
}
