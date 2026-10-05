import type { AppData, ExportOptions } from "@/lib/types";
import { getKv, type Kv } from "@/lib/server/kv";
import { createMemoryAccountStoreOver } from "@/lib/server/account/memoryStore";
import { createRedisAccountStore, redisCredentials } from "@/lib/server/account/redisStore";

// Storage seam of the accounts feature. Routes and the auth service only talk to this
// interface, so Redis can be swapped for Postgres or anything else. Server-only.

export interface StoredUser {
  id: string;
  email: string; // normalized
  emailVerifiedAt?: string;
  passwordHash?: string;
  createdAt: string;
  calendarToken?: string;
}

export interface StoredSession {
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent?: string;
}

export type TokenPurpose = "confirm" | "magic" | "reset" | "email-change";

export interface StoredToken {
  purpose: TokenPurpose;
  userId: string;
  newEmail?: string;
  expiresAt: string;
}

export interface DataDoc {
  version: number;
  updatedAt: string;
  data: AppData;
  exportOptions: ExportOptions;
}

export type CasResult = { ok: true; version: number } | { ok: false; current: DataDoc | null };

export interface AccountStore {
  getUser(id: string): Promise<StoredUser | null>;
  /** ttlSeconds makes the record expire (unconfirmed accounts); omitted, it is kept and any expiry is removed. */
  putUser(user: StoredUser, ttlSeconds?: number): Promise<void>;
  deleteUser(id: string): Promise<void>;
  /** Insert-if-absent, expiring after ttlSeconds when given. Returns false when the email is taken. */
  claimEmail(email: string, userId: string, ttlSeconds?: number): Promise<boolean>;
  /** Resets the expiry of an email index entry; omitted, the entry is kept for good. */
  setEmailExpiry(email: string, ttlSeconds?: number): Promise<void>;
  userIdByEmail(email: string): Promise<string | null>;
  releaseEmail(email: string): Promise<void>;
  /** Also adds the hash to `usess:<userId>`. */
  putSession(hash: string, s: StoredSession, ttlSeconds: number): Promise<void>;
  getSession(hash: string): Promise<StoredSession | null>;
  /** Also removes the hash from `usess:<userId>`. */
  deleteSession(hash: string): Promise<void>;
  deleteUserSessions(userId: string, exceptHash?: string): Promise<void>;
  putToken(hash: string, t: StoredToken, ttlSeconds: number): Promise<void>;
  /** Atomic get-and-delete. */
  takeToken(hash: string): Promise<StoredToken | null>;
  /** 0 when the user has no data yet. */
  getDataVersion(userId: string): Promise<number>;
  getData(userId: string): Promise<DataDoc | null>;
  /** Writes only when the stored version equals baseVersion (0 = none yet); new version = baseVersion + 1. */
  casData(userId: string, baseVersion: number, next: Omit<DataDoc, "version">): Promise<CasResult>;
  deleteData(userId: string): Promise<void>;
  /** The generic store, for rate limits, feed caches, rendered calendars and digests. */
  kv: Kv;
}

let cached: AccountStore | null | undefined;

/** The store, or null when the server has no storage configured (production only). */
export function getAccountStore(): AccountStore | null {
  if (cached !== undefined) return cached;
  const credentials = redisCredentials();
  if (credentials) cached = createRedisAccountStore(credentials.url, credentials.token);
  else {
    const kv = getKv();
    cached = kv ? createMemoryAccountStoreOver(kv) : null;
  }
  return cached;
}
