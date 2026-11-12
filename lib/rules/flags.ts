// Review flags ("Ellenőrizd") in the reader's language. A flag written by the extraction stores a
// stable `code` and its `args`; the text is rendered from the dictionary at display time. A flag
// without a code (older saved rules, hand-written JSON) shows its stored `message` as it is.
// `flagFor` builds a flag: the Hungarian `message` is stored next to the code so the data stays
// readable by anything that ignores codes and a shared template's hash does not depend on the
// language the document was read in. Pure.

import { getMessages, type Locale } from "@/lib/i18n";
import type { RuleFlag } from "./types";

export type FlagCode = keyof ReturnType<typeof getMessages>["rules"]["flags"];
type FlagArg = string | number;

function render(code: string, args: readonly FlagArg[], locale: Locale): string | null {
  const fn = (getMessages(locale).rules.flags as Record<string, unknown>)[code];
  if (typeof fn === "string") return fn;
  if (typeof fn === "function") return (fn as (...a: FlagArg[]) => string)(...args);
  return null;
}

/** The text of a flag in `locale`: the dictionary's wording for its code, else the stored message. */
export function flagText(flag: Pick<RuleFlag, "message" | "code" | "args">, locale: Locale = "hu"): string {
  return (flag.code ? render(flag.code, flag.args ?? [], locale) : null) ?? flag.message;
}

/** A new, unresolved flag with its code, arguments and the Hungarian fallback message. */
export function flagFor(field: string, code: FlagCode, ...args: FlagArg[]): RuleFlag {
  return { field, message: render(code, args, "hu") ?? code, resolved: false, code, ...(args.length > 0 && { args }) };
}
