import { promises as dns } from "node:dns";
import net from "node:net";

/**
 * Thrown when a URL resolves to (or is) a non-public address.
 * Server-only module: relies on node:dns / node:net.
 */
export class SsrfBlockedError extends Error {
  constructor(message = "Nem engedélyezett cím") {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((p) => Number(p));
  return (
    (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0) & 0xffffffff
  );
}

function ipv4InRange(ip: string, base: string, prefixLength: number): boolean {
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  const mask = prefixLength === 0 ? 0 : (~0 << (32 - prefixLength)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function isPrivateIPv4(ip: string): boolean {
  return (
    ipv4InRange(ip, "0.0.0.0", 8) ||
    ipv4InRange(ip, "10.0.0.0", 8) ||
    ipv4InRange(ip, "127.0.0.0", 8) ||
    ipv4InRange(ip, "169.254.0.0", 16) ||
    ipv4InRange(ip, "172.16.0.0", 12) ||
    ipv4InRange(ip, "192.168.0.0", 16) ||
    ipv4InRange(ip, "100.64.0.0", 10)
  );
}

/** Parses a (possibly compressed) IPv6 literal into a 128-bit BigInt. */
function ipv6ToBigInt(ip: string): bigint | null {
  let address = ip;

  // Expand a trailing embedded IPv4 (e.g. "::ffff:127.0.0.1") into hex groups.
  const v4Tail = address.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Tail) {
    const [a, b, c, d] = v4Tail[1].split(".").map((p) => Number(p));
    if ([a, b, c, d].some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
    const hex1 = ((a << 8) | b).toString(16);
    const hex2 = ((c << 8) | d).toString(16);
    address = address.slice(0, address.length - v4Tail[1].length) + `${hex1}:${hex2}`;
  }

  const parts = address.split("::");
  if (parts.length > 2) return null;

  const headParts = parts[0] ? parts[0].split(":").filter((s) => s.length > 0) : [];
  const tailParts =
    parts.length === 2 && parts[1] ? parts[1].split(":").filter((s) => s.length > 0) : [];

  let groups: string[];
  if (parts.length === 2) {
    const missing = 8 - headParts.length - tailParts.length;
    if (missing < 0) return null;
    groups = [...headParts, ...Array(missing).fill("0"), ...tailParts];
  } else {
    groups = headParts;
  }

  if (groups.length !== 8) return null;

  // Note: BigInt literals (0n) require an ES2020+ tsconfig target, so this
  // file uses the BigInt() constructor function throughout instead.
  let result = BigInt(0);
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    result = (result << BigInt(16)) | BigInt(parseInt(group, 16));
  }
  return result;
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ipv6ToBigInt(ip);
  if (addr === null) return true; // fail closed on anything we can't parse

  if (addr === BigInt(0)) return true; // ::
  if (addr === BigInt(1)) return true; // ::1

  // IPv4-mapped IPv6: ::ffff:a.b.c.d -> top 96 bits are 0..0:ffff
  if (addr >> BigInt(32) === BigInt(0xffff)) {
    const v4 = addr & BigInt(0xffffffff);
    const a = Number((v4 >> BigInt(24)) & BigInt(0xff));
    const b = Number((v4 >> BigInt(16)) & BigInt(0xff));
    const c = Number((v4 >> BigInt(8)) & BigInt(0xff));
    const d = Number(v4 & BigInt(0xff));
    return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
  }

  if (addr >> BigInt(121) === BigInt(0x7e)) return true; // fc00::/7 (top 7 bits: 1111110)
  if (addr >> BigInt(118) === BigInt(0x3fa)) return true; // fe80::/10 (top 10 bits: 1111111010)

  return false;
}

function stripBrackets(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

/**
 * Rejects URLs whose hostname is (or resolves to) a private, loopback,
 * link-local, CGNAT or otherwise non-public address. Throws SsrfBlockedError.
 * Any other failure (e.g. DNS resolution error) is rethrown as-is, so callers
 * can distinguish "blocked by policy" from "network/DNS error".
 */
export async function assertPublicUrl(url: URL): Promise<void> {
  const hostname = stripBrackets(url.hostname).toLowerCase();

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new SsrfBlockedError();
  }

  // Explicit check for IP-literal hostnames, in addition to the DNS lookup
  // below (which would resolve a literal to itself anyway).
  const literalFamily = net.isIP(hostname);
  if (literalFamily === 4 && isPrivateIPv4(hostname)) {
    throw new SsrfBlockedError();
  }
  if (literalFamily === 6 && isPrivateIPv6(hostname)) {
    throw new SsrfBlockedError();
  }

  const addresses = await dns.lookup(hostname, { all: true });
  if (addresses.length === 0) {
    throw new SsrfBlockedError();
  }

  for (const { address, family } of addresses) {
    if (family === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address)) {
      throw new SsrfBlockedError();
    }
  }
}
