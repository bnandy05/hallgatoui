import { getMessages } from "@/lib/i18n";
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Password hashing on node:crypto scrypt: `scrypt$N$r$p$salt$hash` (base64url). Server-only.

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 128 * N * R * 2; // scrypt needs 128*N*r bytes; the default cap is exactly that

export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 200;

/** The error code (see errors.* in the dictionaries) for an unacceptable password, or null. */
export function passwordPolicyCode(pw: unknown): "password_required" | "password_short" | "password_long" | null {
  if (typeof pw !== "string") return "password_required";
  if (pw.length < MIN_PASSWORD) return "password_short";
  if (pw.length > MAX_PASSWORD) return "password_long";
  return null;
}

/** A Hungarian error message, or null when the password is acceptable. */
export function checkPasswordPolicy(pw: unknown): string | null {
  const code = passwordPolicyCode(pw);
  return code ? getMessages("hu").errors[code] : null;
}

function derive(pw: string, salt: Buffer, n: number, r: number, p: number, length: number): Promise<Buffer> {
  const options: ScryptOptions = { N: n, r, p, maxmem: Math.max(MAX_MEMORY, 128 * n * r * 2) };
  return new Promise((resolve, reject) =>
    scrypt(pw.normalize("NFKC"), salt, length, options, (err, key) => (err ? reject(err) : resolve(key)))
  );
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await derive(pw, salt, N, R, P, KEY_LENGTH);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

let dummyHash: Promise<string> | undefined;

/** Constant-time check. Without a stored hash it verifies a dummy one, so timing doesn't reveal accounts. */
export async function verifyPassword(pw: string, stored: string | undefined): Promise<boolean> {
  if (!stored) {
    await verifyPassword(pw, await (dummyHash ??= hashPassword(randomBytes(16).toString("hex"))));
    return false;
  }
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !hash) return false;
  try {
    const expected = Buffer.from(hash, "base64url");
    const actual = await derive(pw, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p), expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
