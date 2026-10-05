import {
  bestVariant,
  confirmVariant,
  forgetUser,
  MAX_TEMPLATE_RULES_BYTES,
  previousSemester,
  reportVariant,
  shareableRules,
  templateKey,
  type StoredTemplate,
  type TemplateVariant,
} from "@/lib/rules/shared";
import type { SubjectRules } from "@/lib/rules/types";
import { validateRules } from "@/lib/rules/validate";
import { hashToken } from "@/lib/server/auth/tokens";
import type { Kv } from "@/lib/server/kv";

// Storage of the shared rule templates (pure logic in lib/rules/shared.ts). Keys:
//   tpl:<university>:<code>:<semester>  → StoredTemplate (no expiry)
//   uni:<userId>                         → the account's university id
//   tplu:<userId>                        → set of template keys the user confirmed or reported
// Server-only.

export const uniKey = (userId: string) => `uni:${userId}`;
const userIndexKey = (userId: string) => `tplu:${userId}`;

/** The id stored in a template: never the user id itself. */
export function templateVoter(userId: string): string {
  return hashToken(`tpl:${userId}`).slice(0, 32);
}

export interface TemplateOffer {
  variantId: string;
  rules: SubjectRules;
  confirmations: number;
  semester: string;
  previous: boolean; // from the term before: "Előző félévi, ellenőrizd"
  mine: boolean; // the user already confirmed this one
}

function offer(v: TemplateVariant, semester: string, previous: boolean, who: string): TemplateOffer {
  return { variantId: v.id, rules: v.rules, confirmations: v.confirmers.length, semester, previous, mine: v.confirmers.includes(who) };
}

export async function findTemplate(kv: Kv, userId: string, university: string, code: string, semester: string): Promise<TemplateOffer | null> {
  const who = templateVoter(userId);
  const current = bestVariant(await kv.get<StoredTemplate>(templateKey(university, code, semester)));
  if (current) return offer(current, semester, false, who);
  const prev = previousSemester(semester);
  if (!prev) return null;
  const old = bestVariant(await kv.get<StoredTemplate>(templateKey(university, code, prev)));
  return old ? offer(old, prev, true, who) : null;
}

/** Publishes or confirms the user's rules for this subject and term. Returns an error text or null. */
export async function confirmTemplate(
  kv: Kv,
  userId: string,
  university: string,
  code: string,
  semester: string,
  rules: unknown,
  now: Date
): Promise<string | null> {
  const checked = validateRules(rules);
  if (!checked.ok) return "Érvénytelen szabályok";
  const shared = shareableRules(checked.rules);
  if (JSON.stringify(shared).length > MAX_TEMPLATE_RULES_BYTES) return "Túl nagy szabályrendszer";
  const key = templateKey(university, code, semester);
  const next = confirmVariant(await kv.get<StoredTemplate>(key), shared, templateVoter(userId), now);
  await kv.set(key, next);
  await kv.sadd(userIndexKey(userId), key);
  return null;
}

export async function reportTemplate(kv: Kv, userId: string, university: string, code: string, semester: string, variantId: string): Promise<boolean> {
  const key = templateKey(university, code, semester);
  const t = await kv.get<StoredTemplate>(key);
  if (!t?.variants.some((v) => v.id === variantId)) return false;
  await kv.set(key, reportVariant(t, variantId, templateVoter(userId)));
  await kv.sadd(userIndexKey(userId), key);
  return true;
}

/** Account deletion: the hashed id leaves every template; the rules others confirmed stay. */
export async function forgetTemplateUser(kv: Kv, userId: string): Promise<void> {
  const who = templateVoter(userId);
  const keys = await kv.smembers(userIndexKey(userId));
  for (const key of keys) {
    const t = await kv.get<StoredTemplate>(key);
    if (!t) continue;
    const next = forgetUser(t, who);
    if (next.variants.length) await kv.set(key, next);
    else await kv.del(key);
  }
  await kv.del(userIndexKey(userId), uniKey(userId));
}
