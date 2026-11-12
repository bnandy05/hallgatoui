// Shared rule templates: once one student confirms a subject's rules, everyone at the same
// university with the same subject code and term gets them without another extraction.
// Pure: keys, normalisation, variant choice and the confirm/report bookkeeping. Storage is in
// lib/server/ruleTemplates.ts. A template holds no personal data; confirmers are hashed ids,
// kept only so nobody is counted twice (and removed when their account is deleted).

import type { SubjectRules } from "./types";

export const UNIVERSITIES: { id: string; name: string }[] = [
  { id: "elte", name: "ELTE" },
  { id: "bme", name: "BME" },
  { id: "corvinus", name: "Corvinus" },
  { id: "szte", name: "SZTE" },
  { id: "de", name: "Debreceni Egyetem" },
  { id: "pte", name: "PTE" },
  { id: "me", name: "Miskolci Egyetem" },
  { id: "ppke", name: "PPKE" },
  { id: "sze", name: "Széchenyi István Egyetem" },
  { id: "obuda", name: "Óbudai Egyetem" },
  { id: "semmelweis", name: "Semmelweis Egyetem" },
  { id: "mate", name: "MATE" },
];

export const MAX_VARIANTS = 5;
export const MAX_TEMPLATE_RULES_BYTES = 16_000;

export interface TemplateVariant {
  id: string; // hash of the rules
  rules: SubjectRules;
  confirmers: string[]; // hashed user ids
  reporters: string[]; // hashed user ids that marked it faulty
  createdAt: string;
}

export interface StoredTemplate {
  variants: TemplateVariant[];
}

/** A university id from the list, or a slug of "egyéb" free text ("Egyéb: Pázmány" → "x-pazmany"). */
export function normalizeUniversity(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim();
  if (UNIVERSITIES.some((u) => u.id === v)) return v;
  const slug = v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug.length >= 2 ? `x-${slug.replace(/^x-/, "")}` : null;
}

export function universityName(id: string): string {
  return UNIVERSITIES.find((u) => u.id === id)?.name ?? id.replace(/^x-/, "").replace(/-/g, " ");
}

/** Neptun subject codes, normalised: "ip-18 kvprjg" → "IP-18KVPRJG". Null when it can't be a code. */
export function normalizeSubjectCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, "");
  return /^[A-Z0-9][A-Z0-9_.\-/]{2,29}$/.test(code) ? code : null;
}

/**
 * The academic term "2026-27-1" from a course's semester text ("2026/27/1", "2026-2027-1",
 * "2026/27 ősz") or, without one, from the date: September–January is the autumn term (1),
 * February–August the spring term (2) of the year that started in September.
 */
export function normalizeSemester(input: unknown, now: Date): string {
  if (typeof input === "string") {
    const m = /(20\d{2})\s*[/-]\s*(?:20)?(\d{2})\s*[/-]?\s*(1|2|osz|ősz|tavasz)?/i.exec(input.trim());
    if (m) {
      const term = m[3] === "2" || /tavasz/i.test(m[3] ?? "") ? 2 : 1;
      return `${m[1]}-${m[2]}-${term}`;
    }
  }
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const start = month >= 9 ? year : year - 1;
  const term = month >= 9 || month === 1 ? 1 : 2;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}-${term}`;
}

/** The term before ("2026-27-1" → "2025-26-2"), for "Előző félévi, ellenőrizd". */
export function previousSemester(semester: string): string | null {
  const m = /^(\d{4})-(\d{2})-(1|2)$/.exec(semester);
  if (!m) return null;
  const start = Number(m[1]);
  if (m[3] === "2") return `${start}-${m[2]}-1`;
  return `${start - 1}-${String(start % 100).padStart(2, "0")}-2`;
}

export function templateKey(university: string, code: string, semester: string): string {
  return `tpl:${university}:${code}:${semester}`;
}

/** Canonical JSON (sorted keys), so the same rules always hash the same. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/** The part of a rule set that is shared: no notes (free text), every flag unresolved. */
export function shareableRules(rules: SubjectRules): SubjectRules {
  return {
    schemaVersion: 1,
    components: rules.components.map((c) => {
      const { note: _note, ...rest } = c;
      void _note;
      return rest;
    }),
    retakes: rules.retakes,
    derived: rules.derived,
    tables: rules.tables,
    outcomes: rules.outcomes,
    flags: rules.flags.map((f) => ({ ...f, resolved: false })),
  };
}

/** A short, stable id for a rule set (FNV-1a over canonical JSON, flags' resolved state ignored). */
export function rulesHash(rules: SubjectRules): string {
  const s = canonical(shareableRules(rules));
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

const score = (v: TemplateVariant) => v.confirmers.length - v.reporters.length;

/** The variant to offer: most confirmations minus reports; ties go to the older one. Null if all are net-negative. */
export function bestVariant(t: StoredTemplate | null): TemplateVariant | null {
  if (!t?.variants.length) return null;
  const sorted = [...t.variants].sort((a, b) => score(b) - score(a) || a.createdAt.localeCompare(b.createdAt));
  return score(sorted[0]) > 0 ? sorted[0] : null;
}

/**
 * Adds the user's confirmation: +1 on the variant with the same rules, or a new variant. A user
 * counts for one variant only (confirming another moves their vote). Over MAX_VARIANTS, the
 * lowest-scoring other variant is evicted.
 */
export function confirmVariant(t: StoredTemplate | null, rules: SubjectRules, who: string, now: Date): StoredTemplate {
  const shared = shareableRules(rules);
  const id = rulesHash(shared);
  const variants = (t?.variants ?? []).map((v) => ({
    ...v,
    confirmers: v.confirmers.filter((c) => c !== who),
    reporters: v.id === id ? v.reporters.filter((c) => c !== who) : v.reporters,
  }));
  const existing = variants.find((v) => v.id === id);
  if (existing) existing.confirmers.push(who);
  else variants.push({ id, rules: shared, confirmers: [who], reporters: [], createdAt: now.toISOString() });
  while (variants.length > MAX_VARIANTS) {
    const victim = variants.filter((v) => v.id !== id).sort((a, b) => score(a) - score(b) || b.createdAt.localeCompare(a.createdAt))[0];
    variants.splice(variants.indexOf(victim), 1);
  }
  return { variants: variants.filter((v) => v.confirmers.length > 0) };
}

/** "Hibás a sablon": the user's report on a variant (their confirmation of it is withdrawn). */
export function reportVariant(t: StoredTemplate, variantId: string, who: string): StoredTemplate {
  return {
    variants: t.variants.map((v) =>
      v.id === variantId
        ? { ...v, confirmers: v.confirmers.filter((c) => c !== who), reporters: v.reporters.includes(who) ? v.reporters : [...v.reporters, who] }
        : v
    ),
  };
}

/** Removes a deleted account's hashed id everywhere; variants nobody backs any more are dropped. */
export function forgetUser(t: StoredTemplate, who: string): StoredTemplate {
  return {
    variants: t.variants
      .map((v) => ({ ...v, confirmers: v.confirmers.filter((c) => c !== who), reporters: v.reporters.filter((c) => c !== who) }))
      .filter((v) => v.confirmers.length > 0),
  };
}
