import {
  confirmVariant,
  forgetUser,
  MAX_TEMPLATE_RULES_BYTES,
  previousSemester,
  rankedVariants,
  reportVariant,
  rulesHash,
  shareableRules,
  templateKey,
  type StoredTemplate,
  type TemplateOffer,
} from "@/lib/rules/shared";
import type { ErrorCode } from "@/lib/server/subscription";
import { validateRules } from "@/lib/rules/validate";
import { hashToken } from "@/lib/server/auth/tokens";
import type { Kv } from "@/lib/server/kv";

// Keep existing shared rules and votes under tpl:<university>:<code>:<semester>.
export const uniKey = (userId: string) => `uni:${userId}`;
const userIndexKey = (userId: string) => `tplu:${userId}`;
const historyKey = (university: string, code: string) => `tplt:${university}:${code}`;

export function templateVoter(userId: string): string {
  return hashToken(`tpl:${userId}`).slice(0, 32);
}

export async function findTemplates(
  kv: Kv,
  userId: string,
  university: string,
  codes: string[],
  semester: string,
  activeSemester: string,
): Promise<TemplateOffer[]> {
  const who = templateVoter(userId);

  async function offersFor(term: string): Promise<TemplateOffer[]> {
    const entries = await Promise.all(codes.map(async (code) => ({
      code,
      variants: rankedVariants(await kv.get<StoredTemplate>(templateKey(university, code, term)), who),
    })));
    const versions = new Map<string, TemplateOffer>();
    for (const { code, variants } of entries) {
      for (const v of variants) {
        const offer = versions.get(v.id);
        if (offer && offer.confirmations >= v.confirmers.length) continue;
        versions.set(v.id, {
          code,
          variantId: v.id,
          rules: v.rules,
          confirmations: v.confirmers.length,
          semester: term,
          previous: term < semester || term < activeSemester,
        });
      }
    }
    return [...versions.values()].sort((a, b) => b.confirmations - a.confirmations);
  }

  const current = await offersFor(semester);
  if (current.length) return current;

  const indexed = await Promise.all(codes.map((code) => kv.smembers(historyKey(university, code))));
  const past = new Set(indexed.flat().filter((term) => term < semester));
  // Before the term index existed, lookup reached only one term back. Cover recent legacy shares.
  for (let term = previousSemester(semester), i = 0; term && i < 4; term = previousSemester(term), i++) past.add(term);
  const history = [...past].sort().reverse();
  for (let i = 0; i < history.length; i += 4) {
    const older = (await Promise.all(history.slice(i, i + 4).map(offersFor))).find((offers) => offers.length);
    if (older) return older;
  }
  return [];
}

async function updateTemplate<T>(
  kv: Kv,
  userId: string,
  university: string,
  code: string,
  semester: string,
  change: (previous: StoredTemplate | null) => { next: StoredTemplate | null; result: T },
): Promise<T> {
  const key = templateKey(university, code, semester);
  for (let attempt = 0; attempt < 12; attempt++) {
    const previous = await kv.get<StoredTemplate>(key);
    const { next, result } = change(previous);
    if (next === previous || await kv.compareAndSet(key, previous, next, userIndexKey(userId), historyKey(university, code), semester)) {
      return result;
    }
  }
  throw new Error("Too many concurrent updates to shared requirements");
}

/** Publishes a reviewed document's rules under its own course code and term. */
export async function confirmTemplate(
  kv: Kv,
  userId: string,
  university: string,
  code: string,
  semester: string,
  rules: unknown,
  now: Date,
): Promise<ErrorCode | null> {
  const checked = validateRules(rules);
  if (!checked.ok) return "bad_rules";
  const shared = shareableRules(checked.rules);
  if (JSON.stringify(shared).length > MAX_TEMPLATE_RULES_BYTES) return "rules_too_large";
  const id = rulesHash(shared);
  return updateTemplate<ErrorCode | null>(kv, userId, university, code, semester, (previous) => {
    const next = confirmVariant(previous, shared, templateVoter(userId), now);
    return next.variants.some((v) => v.id === id)
      ? { next, result: null }
      : { next: previous, result: "template_limit" };
  });
}

/** An import counts toward the original version in its original semester. */
export function recordTemplateUse(kv: Kv, userId: string, university: string, code: string, semester: string, variantId: string, now: Date): Promise<boolean> {
  const who = templateVoter(userId);
  return updateTemplate(kv, userId, university, code, semester, (previous) => {
    const variant = rankedVariants(previous, who).find((v) => v.id === variantId);
    return variant
      ? { next: confirmVariant(previous, variant.rules, who, now), result: true }
      : { next: previous, result: false };
  });
}

export function reportTemplate(kv: Kv, userId: string, university: string, code: string, semester: string, variantId: string): Promise<boolean> {
  const who = templateVoter(userId);
  return updateTemplate(kv, userId, university, code, semester, (previous) => previous?.variants.some((v) => v.id === variantId)
    ? { next: reportVariant(previous, variantId, who), result: true }
    : { next: previous, result: false }
  );
}

export async function forgetTemplateUser(kv: Kv, userId: string): Promise<void> {
  const who = templateVoter(userId);
  const keys = await kv.smembers(userIndexKey(userId));
  for (const key of keys) {
    const [, university, code, semester] = key.split(":");
    await updateTemplate(kv, userId, university, code, semester, (previous) => {
      const next = previous && forgetUser(previous, who);
      return { next: next?.variants.length ? next : null, result: undefined };
    });
  }
  await kv.del(userIndexKey(userId), uniKey(userId));
}
