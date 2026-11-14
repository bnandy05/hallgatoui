import { suggestDeadlineLinks, type LinkTarget } from "@/lib/rules/links";
import { normalizeSearch } from "@/lib/text";

// Which deadlines are a grade component's items. The kind words (`suggestDeadlineLinks`) find the
// candidates; numbers then pick between sibling components ("1. zh" vs "2. zh"), and a candidate
// whose number fits a sibling instead is dropped. When nothing is left, Jev is worth asking. Pure.

const KIND_TEXT: Record<LinkTarget["kind"], string> = {
  attendance: "attendance",
  exam: "test or exam",
  assignment: "assignment",
  series: "series of quizzes or small tests",
  bonus: "bonus points",
  retake: "retake",
};

const numbersIn = (text: string) => new Set((normalizeSearch(text).match(/\d+/g) ?? []).map((n) => String(Number(n))));

export function localDeadlineMatches<D extends { courseId: string | null; title: string; due: string; done?: boolean }>(
  target: LinkTarget,
  targets: LinkTarget[],
  courseId: string,
  deadlines: D[]
): D[] {
  const candidates = suggestDeadlineLinks(target, courseId, deadlines);
  const siblings = targets.filter((t) => t.id !== target.id && t.kind === target.kind);
  if (siblings.length === 0) return candidates;
  const own = numbersIn(target.label);
  return candidates.filter((d) => {
    const nums = numbersIn(d.title);
    if (nums.size === 0) return false; // "ZH" with two zh components: ambiguous
    return [...nums].some((n) => own.has(n));
  });
}

/** The option text Jev reads for a component. */
export function componentOption(target: LinkTarget): string {
  return `${target.label} (${KIND_TEXT[target.kind]})`;
}
