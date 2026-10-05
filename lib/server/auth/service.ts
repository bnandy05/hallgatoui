import { randomUUID } from "node:crypto";
import { normalizeEmail } from "@/lib/digest";
import { renderAuthEmail, type AuthEmailKind } from "@/lib/authEmail";
import type { OutgoingEmail } from "@/lib/server/email";
import type { AccountStore, StoredUser, TokenPurpose } from "@/lib/server/account/store";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "@/lib/server/auth/password";
import {
  PENDING_ACCOUNT_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  TOKEN_TTL_SECONDS,
  hashToken,
  newToken,
} from "@/lib/server/auth/tokens";
import { DIGEST_INDEX_KEY, chgKey, digKey, icsIndexKey, srcKey, subKey } from "@/lib/server/subscription";

// Account logic (register, sign-in, email links, sessions) over an AccountStore. Every function
// takes its dependencies first so tests can run it on the memory store with a recording mailer.
// Server-only. Never log emails, passwords, tokens or session ids.

export interface AuthDeps {
  store: AccountStore;
  send: (mail: OutgoingEmail) => Promise<boolean>;
  now: () => Date;
  appUrl: string;
  ip: string;
}

export type AuthError = { error: string; status: number };
export type LinkKind = "megerosites" | "belepes" | "jelszo" | "email";

const ERR_RATE: AuthError = { error: "Túl sok próbálkozás, próbáld újra később", status: 429 };
const ERR_MAIL: AuthError = { error: "Most nem tudtunk levelet küldeni, próbáld később", status: 502 };
const ERR_LINK: AuthError = { error: "A link lejárt vagy már felhasználták", status: 400 };
const ERR_EMAIL: AuthError = { error: "Érvénytelen e-mail-cím", status: 400 };
const ERR_CREDENTIALS: AuthError = { error: "Hibás e-mail-cím vagy jelszó", status: 401 };
const ERR_TAKEN: AuthError = { error: "Ez a cím már foglalt", status: 409 };

const HOUR = 3600;
const LOGIN_WINDOW = 15 * 60;
const SLIDE_AFTER_MS = 24 * 3600 * 1000;
const MAX_USER_AGENT = 200;

const PURPOSE_OF: Record<LinkKind, TokenPurpose> = {
  megerosites: "confirm",
  belepes: "magic",
  jelszo: "reset",
  email: "email-change",
};
const KIND_OF: Record<AuthEmailKind, LinkKind> = {
  confirm: "megerosites",
  magic: "belepes",
  reset: "jelszo",
  "already-registered": "belepes",
  "email-change": "email",
};

export const isAuthError = (value: unknown): value is AuthError =>
  !!value && typeof value === "object" && "error" in value;

/** True when the counter for this action is over its limit. */
async function limited(d: AuthDeps, action: string, who: string, limit: number, windowSeconds: number) {
  // Emails are hashed so no address ends up in a key name.
  const id = who.includes("@") ? hashToken(who) : who;
  return (await d.store.kv.incr(`rl:${action}:${id}`, windowSeconds)) > limit;
}

/** Stores a single-use token and mails its link. Returns false when the mail didn't go out. */
async function sendLink(
  d: AuthDeps,
  kind: AuthEmailKind,
  to: string,
  userId: string,
  newEmail?: string
): Promise<boolean> {
  const purpose: TokenPurpose = kind === "already-registered" ? "magic" : kind;
  const token = newToken();
  const ttl = TOKEN_TTL_SECONDS[purpose];
  await d.store.putToken(
    hashToken(token),
    { purpose, userId, newEmail, expiresAt: new Date(d.now().getTime() + ttl * 1000).toISOString() },
    ttl
  );
  const link = `${d.appUrl}/fiok/link?m=${KIND_OF[kind]}&t=${token}`;
  return d.send({ to, ...renderAuthEmail(kind, link) });
}

async function startSession(d: AuthDeps, userId: string, ua?: string): Promise<string> {
  const token = newToken();
  const at = d.now().toISOString();
  await d.store.putSession(
    hashToken(token),
    { userId, createdAt: at, lastSeenAt: at, userAgent: ua?.slice(0, MAX_USER_AGENT) },
    SESSION_TTL_SECONDS
  );
  return token;
}

export async function register(d: AuthDeps, email: unknown, password: unknown): Promise<{ ok: true } | AuthError> {
  if (await limited(d, "register", d.ip, 5, HOUR)) return ERR_RATE;
  const normalized = normalizeEmail(email);
  if (!normalized) return ERR_EMAIL;
  const policy = checkPasswordPolicy(password);
  if (policy) return { error: policy, status: 400 };

  let existing = await d.store.getUser((await d.store.userIdByEmail(normalized)) ?? "");
  if (!existing && (await d.store.userIdByEmail(normalized))) {
    // Dangling index entry (a crash between the two writes): free it and start over.
    await d.store.releaseEmail(normalized);
  }

  if (existing?.emailVerifiedAt) {
    // A confirmed account: never touch it; mail a sign-in link instead.
    return (await sendLink(d, "already-registered", normalized, existing.id)) ? { ok: true } : ERR_MAIL;
  }
  const passwordHash = await hashPassword(password as string);
  if (existing) {
    // Unconfirmed: whoever registers last owns the pending account (stops address squatting).
    existing = { ...existing, passwordHash };
    await d.store.putUser(existing, PENDING_ACCOUNT_TTL_SECONDS);
    await d.store.setEmailExpiry(normalized, PENDING_ACCOUNT_TTL_SECONDS);
  } else {
    const user: StoredUser = {
      id: randomUUID(),
      email: normalized,
      passwordHash,
      createdAt: d.now().toISOString(),
    };
    // Unconfirmed registrations expire on their own (storage limitation); confirming keeps them.
    if (!(await d.store.claimEmail(normalized, user.id, PENDING_ACCOUNT_TTL_SECONDS))) return { ok: true }; // lost a race; the winner mails
    await d.store.putUser(user, PENDING_ACCOUNT_TTL_SECONDS);
    existing = user;
  }
  return (await sendLink(d, "confirm", normalized, existing.id)) ? { ok: true } : ERR_MAIL;
}

export async function login(
  d: AuthDeps,
  email: unknown,
  password: unknown,
  ua?: string
): Promise<{ sessionToken: string; userId: string } | AuthError> {
  const normalized = normalizeEmail(email);
  if (await limited(d, "login-ip", d.ip, 10, LOGIN_WINDOW)) return ERR_RATE;
  if (normalized && (await limited(d, "login-email", normalized, 5, LOGIN_WINDOW))) return ERR_RATE;

  const userId = normalized ? await d.store.userIdByEmail(normalized) : null;
  const user = userId ? await d.store.getUser(userId) : null;
  // Always verify something, so an unknown email takes as long as a wrong password.
  const ok = await verifyPassword(typeof password === "string" ? password : "", user?.passwordHash);
  if (!user || !ok) return ERR_CREDENTIALS;
  if (!user.emailVerifiedAt) return { error: "Előbb erősítsd meg az e-mail-címedet", status: 403 };
  return { sessionToken: await startSession(d, user.id, ua), userId: user.id };
}

async function requestLink(d: AuthDeps, kind: "magic" | "reset", email: unknown): Promise<{ ok: true } | AuthError> {
  const normalized = normalizeEmail(email);
  if (!normalized) return ERR_EMAIL;
  if ((await limited(d, `${kind}-email`, normalized, 3, HOUR)) || (await limited(d, `${kind}-ip`, d.ip, 10, HOUR))) {
    return ERR_RATE;
  }
  const userId = await d.store.userIdByEmail(normalized);
  const user = userId ? await d.store.getUser(userId) : null;
  if (!user) return { ok: true }; // never reveal whether the address has an account
  return (await sendLink(d, kind, normalized, user.id)) ? { ok: true } : ERR_MAIL;
}

export const requestMagicLink = (d: AuthDeps, email: unknown) => requestLink(d, "magic", email);
export const requestPasswordReset = (d: AuthDeps, email: unknown) => requestLink(d, "reset", email);

/** Consumes an emailed link (the only place a token is used up) and signs the user in. */
export async function consumeLink(
  d: AuthDeps,
  kind: LinkKind,
  token: string,
  newPassword?: string,
  ua?: string
): Promise<{ sessionToken?: string; userId: string } | AuthError> {
  if (typeof token !== "string" || token.length === 0 || token.length > 200 || !(kind in PURPOSE_OF)) return ERR_LINK;
  if (kind === "jelszo") {
    // Check before the token is used up, so a too short password can be corrected.
    const policy = checkPasswordPolicy(newPassword);
    if (policy) return { error: policy, status: 400 };
  }
  const stored = await d.store.takeToken(hashToken(token));
  if (!stored || stored.purpose !== PURPOSE_OF[kind] || new Date(stored.expiresAt) <= d.now()) return ERR_LINK;
  const user = await d.store.getUser(stored.userId);
  if (!user) return ERR_LINK;

  const at = d.now().toISOString();
  let next: StoredUser = { ...user, emailVerifiedAt: user.emailVerifiedAt ?? at };
  if (kind === "jelszo") {
    next.passwordHash = await hashPassword(newPassword as string);
  } else if (kind === "email") {
    const newEmail = stored.newEmail ? normalizeEmail(stored.newEmail) : null;
    if (!newEmail) return ERR_LINK;
    if (newEmail !== user.email) {
      if (!(await d.store.claimEmail(newEmail, user.id))) return ERR_TAKEN;
      await d.store.releaseEmail(user.email);
      next = { ...next, email: newEmail };
    }
  }
  await d.store.putUser(next);
  if (!user.emailVerifiedAt) await d.store.setEmailExpiry(user.email);
  if (kind === "jelszo") await d.store.deleteUserSessions(user.id);
  // An email-change link only proves control of the new address, not of the account (a
  // mistyped address must not hand the account to its owner), so it never signs anyone in.
  if (kind === "email") return { userId: user.id };
  return { sessionToken: await startSession(d, user.id, ua), userId: user.id };
}

/** The signed-in user, or null. Slides the session's expiry at most once every 24 hours. */
export async function sessionUser(d: AuthDeps, sessionToken: string | undefined): Promise<StoredUser | null> {
  if (!sessionToken) return null;
  const hash = hashToken(sessionToken);
  const session = await d.store.getSession(hash);
  if (!session) return null;
  const user = await d.store.getUser(session.userId);
  if (!user) return null;
  if (d.now().getTime() - new Date(session.lastSeenAt).getTime() >= SLIDE_AFTER_MS) {
    await d.store.putSession(hash, { ...session, lastSeenAt: d.now().toISOString() }, SESSION_TTL_SECONDS);
  }
  return user;
}

export async function logout(d: AuthDeps, sessionToken: string, everywhere: boolean): Promise<void> {
  const hash = hashToken(sessionToken);
  if (everywhere) {
    const session = await d.store.getSession(hash);
    if (session) await d.store.deleteUserSessions(session.userId);
  }
  await d.store.deleteSession(hash);
}

export async function changePassword(
  d: AuthDeps,
  user: StoredUser,
  current: unknown,
  next: unknown,
  keepSession: string
): Promise<{ ok: true } | AuthError> {
  const policy = checkPasswordPolicy(next);
  if (policy) return { error: policy, status: 400 };
  if (user.passwordHash) {
    if (await limited(d, "password", user.id, 5, LOGIN_WINDOW)) return ERR_RATE;
    if (typeof current !== "string" || !(await verifyPassword(current, user.passwordHash))) {
      return { error: "A jelenlegi jelszó hibás", status: 403 };
    }
  }
  await d.store.putUser({ ...user, passwordHash: await hashPassword(next as string) });
  await d.store.deleteUserSessions(user.id, hashToken(keepSession));
  return { ok: true };
}

export async function requestEmailChange(
  d: AuthDeps,
  user: StoredUser,
  email: unknown
): Promise<{ ok: true } | AuthError> {
  const normalized = normalizeEmail(email);
  if (!normalized) return ERR_EMAIL;
  if (normalized === user.email) return { error: "Ez már a fiókod címe", status: 400 };
  if (await limited(d, "email-change", user.id, 3, HOUR)) return ERR_RATE;
  if (await d.store.userIdByEmail(normalized)) return ERR_TAKEN;
  return (await sendLink(d, "email-change", normalized, user.id, normalized)) ? { ok: true } : ERR_MAIL;
}

/** Removes the user and everything they own, in the order that leaves nothing reachable. */
export async function deleteAccount(
  d: AuthDeps,
  user: StoredUser,
  typedEmail: unknown
): Promise<{ ok: true } | AuthError> {
  if (normalizeEmail(typedEmail) !== user.email) {
    return { error: "A beírt e-mail-cím nem egyezik a fiókodéval", status: 400 };
  }
  const { store } = d;
  const kv = store.kv;
  await store.deleteUserSessions(user.id);

  const doc = await store.getData(user.id);
  const feedIds = new Set((doc?.data.feeds ?? []).map((f) => f.id));
  await kv.del(...[...feedIds].map((id) => srcKey(user.id, id)), chgKey(user.id));

  const rendered = await kv.smembers(icsIndexKey(user.id));
  await kv.del(...rendered);
  for (const key of rendered) await kv.srem(icsIndexKey(user.id), key);

  // Re-read: the passed user may predate the calendar token.
  const calendarToken = (await store.getUser(user.id))?.calendarToken ?? user.calendarToken;
  if (calendarToken) await kv.del(subKey(calendarToken));
  await kv.del(digKey(user.id));
  await kv.srem(DIGEST_INDEX_KEY, user.id);

  await store.deleteData(user.id);
  await store.releaseEmail(user.email);
  await store.deleteUser(user.id);
  return { ok: true };
}
