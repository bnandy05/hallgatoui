// Which grade-alert kinds the student wants to see (bell channel). Pure; shared by the types,
// the backup/sync validation and lib/gradeAlerts.ts. Missing = everything on.

import type { AlertKind, AlertKinds, AlertPrefs } from "@/lib/types";

export const ALERT_KIND_LIST: readonly AlertKind[] = ["opportunity", "risk", "absence", "change"];

export const DEFAULT_ALERT_KINDS: AlertKinds = { opportunity: true, risk: true, absence: true, change: true };

/** A kinds object from untrusted JSON: every key a boolean, anything else (or missing) stays on. */
export function alertKindsFrom(value: unknown): AlertKinds | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const o = value as Record<string, unknown>;
  const out = { ...DEFAULT_ALERT_KINDS };
  for (const k of ALERT_KIND_LIST) if (typeof o[k] === "boolean") out[k] = o[k];
  return out;
}

/** Stored preferences from untrusted JSON; malformed means "not set" (all on). */
export function alertPrefsFrom(value: unknown): AlertPrefs | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const o = value as Record<string, unknown>;
  const bell = alertKindsFrom(o.bell);
  if (!bell) return undefined;
  const updatedAt = typeof o.updatedAt === "string" && o.updatedAt.length <= 40 && Number.isFinite(Date.parse(o.updatedAt));
  return { bell, ...(updatedAt && { updatedAt: o.updatedAt as string }) };
}

/** The kinds in force: the stored ones, or all on. */
export function bellKinds(prefs: AlertPrefs | undefined): AlertKinds {
  return prefs?.bell ?? DEFAULT_ALERT_KINDS;
}
