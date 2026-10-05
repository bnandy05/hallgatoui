import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAccountStore } from "@/lib/server/account/memoryStore";
import {
  changePassword,
  consumeLink,
  deleteAccount,
  isAuthError,
  login,
  logout,
  register,
  requestEmailChange,
  requestMagicLink,
  requestPasswordReset,
  sessionUser,
  type AuthDeps,
  type AuthError,
} from "@/lib/server/auth/service";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "@/lib/server/auth/password";
import { hashToken } from "@/lib/server/auth/tokens";
import { DEFAULT_EXPORT_OPTIONS } from "@/lib/ical/export";
import type { OutgoingEmail } from "@/lib/server/email";
import { emptyAppData } from "./helpers";

const PW = "correct horse battery";

function setup(ip = "1.1.1.1") {
  const mails: OutgoingEmail[] = [];
  let now = new Date("2026-10-05T10:00:00.000Z");
  const store = createMemoryAccountStore();
  const d: AuthDeps = {
    store,
    send: async (m) => (mails.push(m), true),
    now: () => now,
    appUrl: "https://app.example.hu",
    ip,
  };
  const link = (m: OutgoingEmail) => {
    const url = new URL(m.text.match(/https:\/\/\S+/)![0]);
    return { kind: url.searchParams.get("m") as never, token: url.searchParams.get("t")! };
  };
  return { d, store, mails, link, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

const ok = <T>(r: T | AuthError): T => {
  assert.ok(!isAuthError(r), JSON.stringify(r));
  return r as T;
};
const err = (r: unknown, status: number) => {
  assert.ok(isAuthError(r), "expected an error");
  assert.equal((r as AuthError).status, status);
  return r as AuthError;
};

/** Registers and confirms; returns the session token. */
async function confirmed(s: ReturnType<typeof setup>, email = "anna@x.hu") {
  ok(await register(s.d, email, PW));
  const { kind, token } = s.link(s.mails.at(-1)!);
  const result = ok(await consumeLink(s.d, kind, token));
  assert.ok(result.sessionToken);
  return { ...result, sessionToken: result.sessionToken };
}

test("password policy and hashing", async () => {
  assert.ok(checkPasswordPolicy("short"));
  assert.ok(checkPasswordPolicy("x".repeat(201)));
  assert.ok(checkPasswordPolicy(undefined));
  assert.equal(checkPasswordPolicy(PW), null);
  const hash = await hashPassword(PW);
  assert.match(hash, /^scrypt\$32768\$8\$1\$/);
  assert.equal(await verifyPassword(PW, hash), true);
  assert.equal(await verifyPassword("nope nope nope", hash), false);
  assert.equal(await verifyPassword(PW, undefined), false);
});

test("register sends a confirm mail; login is blocked until confirmed", async () => {
  const s = setup();
  ok(await register(s.d, "anna@x.hu", PW));
  assert.equal(s.mails.length, 1);
  assert.equal(s.mails[0].to, "anna@x.hu");
  const { kind, token } = s.link(s.mails[0]);
  assert.equal(kind, "megerosites");
  err(await login(s.d, "anna@x.hu", PW), 403);
  const session = ok(await consumeLink(s.d, kind, token));
  assert.ok((await sessionUser(s.d, session.sessionToken))?.emailVerifiedAt);
  ok(await login(s.d, "anna@x.hu", PW));
});

test("email case and whitespace give the same account everywhere", async () => {
  const s = setup();
  ok(await register(s.d, " Anna@X.hu ", PW));
  assert.equal(s.mails[0].to, "anna@x.hu");
  const { kind, token } = s.link(s.mails[0]);
  ok(await consumeLink(s.d, kind, token));
  ok(await login(s.d, "anna@x.hu", PW));
  ok(await login(s.d, "  ANNA@x.hu", PW));
  ok(await requestMagicLink(s.d, "ANNA@X.HU "));
  assert.equal(s.mails.length, 2);
  assert.equal(s.mails[1].to, "anna@x.hu");
  ok(await requestPasswordReset(s.d, " Anna@x.hu"));
  assert.equal(s.mails[2].to, "anna@x.hu");
});

test("a link works once; a second use fails cleanly", async () => {
  const s = setup();
  ok(await register(s.d, "anna@x.hu", PW));
  const { kind, token } = s.link(s.mails[0]);
  ok(await consumeLink(s.d, kind, token));
  const second = err(await consumeLink(s.d, kind, token), 400);
  assert.equal(second.error, "A link lejárt vagy már felhasználták");
});

test("an expired link fails", async () => {
  const s = setup();
  await confirmed(s);
  ok(await requestMagicLink(s.d, "anna@x.hu"));
  const { kind, token } = s.link(s.mails.at(-1)!);
  s.advance(31 * 60 * 1000);
  err(await consumeLink(s.d, kind, token), 400);
});

test("a token only works for its own purpose", async () => {
  const s = setup();
  await confirmed(s);
  ok(await requestPasswordReset(s.d, "anna@x.hu"));
  const { kind, token } = s.link(s.mails.at(-1)!);
  assert.equal(kind, "jelszo");
  err(await consumeLink(s.d, "belepes", token), 400);
});

test("registering an unconfirmed address again replaces the password", async () => {
  const s = setup();
  ok(await register(s.d, "anna@x.hu", PW));
  ok(await register(s.d, "anna@x.hu", "another long password"));
  assert.equal(s.mails.length, 2);
  const { kind, token } = s.link(s.mails[1]);
  ok(await consumeLink(s.d, kind, token));
  err(await login(s.d, "anna@x.hu", PW), 401);
  ok(await login(s.d, "anna@x.hu", "another long password"));
});

test("registering a confirmed address mails a sign-in link and keeps the password", async () => {
  const s = setup();
  await confirmed(s);
  ok(await register(s.d, "anna@x.hu", "attacker long password"));
  const mail = s.mails.at(-1)!;
  assert.equal(mail.subject, "Már van fiókod");
  assert.equal(s.link(mail).kind, "belepes");
  err(await login(s.d, "anna@x.hu", "attacker long password"), 401);
  ok(await login(s.d, "anna@x.hu", PW));
  ok(await consumeLink(s.d, "belepes", s.link(mail).token));
});

test("wrong password and unknown email give the identical error", async () => {
  const s = setup();
  await confirmed(s);
  const wrong = err(await login(s.d, "anna@x.hu", "wrong wrong wrong"), 401);
  const unknown = err(await login(s.d, "nobody@x.hu", "wrong wrong wrong"), 401);
  assert.deepEqual(wrong, unknown);
});

test("a reset sets the password, confirms, and ends the other sessions", async () => {
  const s = setup();
  const first = await confirmed(s);
  ok(await requestPasswordReset(s.d, "anna@x.hu"));
  const { kind, token } = s.link(s.mails.at(-1)!);
  err(await consumeLink(s.d, kind, token, "short"), 400);
  const fresh = ok(await consumeLink(s.d, kind, token, "brand new password"));
  assert.equal(await sessionUser(s.d, first.sessionToken), null);
  assert.ok(await sessionUser(s.d, fresh.sessionToken));
  ok(await login(s.d, "anna@x.hu", "brand new password"));
  err(await login(s.d, "anna@x.hu", PW), 401);
});

test("magic and reset requests for unknown addresses succeed silently", async () => {
  const s = setup();
  ok(await requestMagicLink(s.d, "nobody@x.hu"));
  ok(await requestPasswordReset(s.d, "nobody@x.hu"));
  assert.equal(s.mails.length, 0);
});

test("login is rate limited per email", async () => {
  const s = setup();
  await confirmed(s);
  for (let i = 0; i < 5; i++) err(await login(s.d, "anna@x.hu", "wrong wrong wrong"), 401);
  err(await login(s.d, "anna@x.hu", PW), 429);
});

test("register is rate limited per IP", async () => {
  const s = setup();
  for (let i = 0; i < 5; i++) ok(await register(s.d, `u${i}@x.hu`, PW));
  err(await register(s.d, "u6@x.hu", PW), 429);
});

test("a failed mail is a 502", async () => {
  const s = setup();
  s.d.send = async () => false;
  err(await register(s.d, "anna@x.hu", PW), 502);
});

test("logout ends one or all sessions", async () => {
  const s = setup();
  const a = await confirmed(s);
  const b = ok(await login(s.d, "anna@x.hu", PW));
  const c = ok(await login(s.d, "anna@x.hu", PW));
  await logout(s.d, a.sessionToken, false);
  assert.equal(await sessionUser(s.d, a.sessionToken), null);
  assert.ok(await sessionUser(s.d, b.sessionToken));
  await logout(s.d, b.sessionToken, true);
  assert.equal(await sessionUser(s.d, c.sessionToken), null);
});

test("sessions slide at most once a day", async () => {
  const s = setup();
  const a = await confirmed(s);
  const hash = hashToken(a.sessionToken);
  const created = (await s.store.getSession(hash))!.lastSeenAt;
  s.advance(3600_000);
  await sessionUser(s.d, a.sessionToken);
  assert.equal((await s.store.getSession(hash))!.lastSeenAt, created);
  s.advance(24 * 3600_000);
  await sessionUser(s.d, a.sessionToken);
  assert.notEqual((await s.store.getSession(hash))!.lastSeenAt, created);
});

test("change password keeps only the current session", async () => {
  const s = setup();
  const a = await confirmed(s);
  const b = ok(await login(s.d, "anna@x.hu", PW));
  const user = (await sessionUser(s.d, a.sessionToken))!;
  err(await changePassword(s.d, user, "wrong wrong wrong", "new long password", a.sessionToken), 403);
  ok(await changePassword(s.d, user, PW, "new long password", a.sessionToken));
  assert.ok(await sessionUser(s.d, a.sessionToken));
  assert.equal(await sessionUser(s.d, b.sessionToken), null);
  ok(await login(s.d, "anna@x.hu", "new long password"));
});

test("email change: confirmed through the link, refused when the address is taken", async () => {
  const s = setup();
  const a = await confirmed(s);
  await confirmed(s, "bela@x.hu");
  const user = (await sessionUser(s.d, a.sessionToken))!;
  assert.equal(err(await requestEmailChange(s.d, user, "bela@x.hu"), 409).error, "Ez a cím már foglalt");

  ok(await requestEmailChange(s.d, user, "Anna2@x.hu"));
  const mail = s.mails.at(-1)!;
  assert.equal(mail.to, "anna2@x.hu");
  const { kind, token } = s.link(mail);
  assert.equal(kind, "email");
  ok(await consumeLink(s.d, kind, token));
  assert.equal(await s.store.userIdByEmail("anna@x.hu"), null);
  assert.equal(await s.store.userIdByEmail("anna2@x.hu"), user.id);
  ok(await login(s.d, "anna2@x.hu", PW));
});

test("an email-change link changes the address but signs nobody in", async () => {
  const s = setup();
  const a = await confirmed(s);
  const user = (await sessionUser(s.d, a.sessionToken))!;
  ok(await requestEmailChange(s.d, user, "typo@x.hu"));
  const { kind, token } = s.link(s.mails.at(-1)!);
  const result = ok(await consumeLink(s.d, kind, token));
  assert.equal(result.sessionToken, undefined);
});

test("email change loses to an address claimed in the meantime", async () => {
  const s = setup();
  const a = await confirmed(s);
  const user = (await sessionUser(s.d, a.sessionToken))!;
  ok(await requestEmailChange(s.d, user, "late@x.hu"));
  const { kind, token } = s.link(s.mails.at(-1)!);
  await confirmed(s, "late@x.hu");
  assert.equal(err(await consumeLink(s.d, kind, token), 409).error, "Ez a cím már foglalt");
});

test("deleteAccount removes everything the user owns", async () => {
  const s = setup();
  const a = await confirmed(s);
  const user = (await sessionUser(s.d, a.sessionToken))!;
  const kv = s.store.kv;
  await s.store.casData(user.id, 0, {
    updatedAt: "x",
    exportOptions: DEFAULT_EXPORT_OPTIONS,
    data: { ...emptyAppData(), feeds: [{ id: "f1", name: "Canvas", url: "https://e.hu/f.ics", platformId: "canvas", courseId: null }] },
  });
  await s.store.putUser({ ...user, calendarToken: "tok_calendar_000000000000" });
  await kv.set("sub:tok_calendar_000000000000", { userId: user.id });
  await kv.set(`src:${user.id}:f1`, { x: 1 });
  await kv.set(`chg:${user.id}`, { x: 1 });
  await kv.set(`ics:${user.id}:osszes`, "BEGIN");
  await kv.sadd(`icsk:${user.id}`, `ics:${user.id}:osszes`);
  await kv.set(`dig:${user.id}`, { frequency: "heti" });
  await kv.sadd("dig:index", user.id);

  err(await deleteAccount(s.d, user, "other@x.hu"), 400);
  ok(await deleteAccount(s.d, user, " Anna@x.hu"));

  assert.equal(await s.store.getUser(user.id), null);
  assert.equal(await s.store.userIdByEmail("anna@x.hu"), null);
  assert.equal(await s.store.getData(user.id), null);
  assert.equal(await s.store.getSession(hashToken(a.sessionToken)), null);
  assert.equal(await sessionUser(s.d, a.sessionToken), null);
  for (const key of ["sub:tok_calendar_000000000000", `src:${user.id}:f1`, `chg:${user.id}`, `ics:${user.id}:osszes`, `dig:${user.id}`]) {
    assert.equal(await kv.get(key), null, key);
  }
  assert.deepEqual(await kv.smembers("dig:index"), []);
  assert.deepEqual(await kv.smembers(`icsk:${user.id}`), []);
  assert.deepEqual(await kv.smembers(`usess:${user.id}`), []);
  err(await login(s.d, "anna@x.hu", PW), 401);
});
