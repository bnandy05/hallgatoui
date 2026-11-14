import type { ChecklistItem } from "@/lib/types";

export const MAX_CHECKLIST_ITEMS = 20;
export const MAX_CHECKLIST_TEXT = 200;

export function checklistProgress(list: ChecklistItem[] | undefined): { done: number; total: number } {
  if (!list) return { done: 0, total: 0 };
  return { done: list.filter((i) => i.done).length, total: list.length };
}

/** Trims text, drops empty items, caps length and count. An empty list becomes `undefined` (no field). */
export function normalizeChecklist(list: ChecklistItem[] | undefined): ChecklistItem[] | undefined {
  if (!list) return undefined;
  const out: ChecklistItem[] = [];
  for (const item of list) {
    const text = item.text.trim().slice(0, MAX_CHECKLIST_TEXT).trim();
    if (!text) continue;
    out.push({ id: item.id, text, done: item.done });
    if (out.length >= MAX_CHECKLIST_ITEMS) break;
  }
  return out.length > 0 ? out : undefined;
}

export function addStep(list: ChecklistItem[] | undefined, text: string, id: string): ChecklistItem[] | undefined {
  return normalizeChecklist([...(list ?? []), { id, text, done: false }]);
}

export function toggleStep(list: ChecklistItem[] | undefined, id: string): ChecklistItem[] | undefined {
  return list?.map((i) => (i.id === id ? { ...i, done: !i.done } : i));
}

/** An emptied text removes the step. */
export function renameStep(list: ChecklistItem[] | undefined, id: string, text: string): ChecklistItem[] | undefined {
  return normalizeChecklist(list?.map((i) => (i.id === id ? { ...i, text } : i)));
}

export function removeStep(list: ChecklistItem[] | undefined, id: string): ChecklistItem[] | undefined {
  return normalizeChecklist(list?.filter((i) => i.id !== id));
}
