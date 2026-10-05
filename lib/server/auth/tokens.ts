import { createHash, randomBytes } from "node:crypto";
import type { TokenPurpose } from "@/lib/server/account/store";

// Random tokens (email links, sessions): only the sha256 is ever stored. Server-only.

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const TOKEN_TTL_SECONDS: Record<TokenPurpose, number> = {
  confirm: 48 * 3600,
  magic: 30 * 60,
  reset: 30 * 60,
  "email-change": 48 * 3600,
};

export const SESSION_TTL_SECONDS = 90 * 86400;
