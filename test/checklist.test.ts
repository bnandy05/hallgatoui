import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addStep,
  checklistProgress,
  MAX_CHECKLIST_ITEMS,
  MAX_CHECKLIST_TEXT,
  normalizeChecklist,
  removeStep,
  renameStep,
  toggleStep,
} from "@/lib/checklist";

test("checklistProgress counts ticked steps", () => {
  assert.deepEqual(checklistProgress(undefined), { done: 0, total: 0 });
  assert.deepEqual(
    checklistProgress([
      { id: "a", text: "A", done: true },
      { id: "b", text: "B", done: false },
    ]),
    { done: 1, total: 2 }
  );
});

test("normalizeChecklist trims, drops empties, caps text and count", () => {
  assert.equal(normalizeChecklist([{ id: "a", text: "   ", done: false }]), undefined);
  assert.equal(normalizeChecklist([]), undefined);
  const out = normalizeChecklist([
    { id: "a", text: "  Olvasd el  ", done: true },
    { id: "b", text: "x".repeat(300), done: false },
  ])!;
  assert.equal(out[0].text, "Olvasd el");
  assert.equal(out[0].done, true);
  assert.equal(out[1].text.length, MAX_CHECKLIST_TEXT);
  const many = Array.from({ length: 30 }, (_, i) => ({ id: String(i), text: `s${i}`, done: false }));
  assert.equal(normalizeChecklist(many)!.length, MAX_CHECKLIST_ITEMS);
});

test("add, toggle, rename and remove steps", () => {
  let list = addStep(undefined, " első ", "1");
  list = addStep(list, "második", "2");
  assert.deepEqual(list!.map((i) => i.text), ["első", "második"]);
  assert.equal(addStep(list, "   ", "3")!.length, 2);
  list = toggleStep(list, "1");
  assert.equal(list![0].done, true);
  assert.equal(list![1].done, false);
  list = renameStep(list, "2", "harmadik");
  assert.equal(list![1].text, "harmadik");
  assert.equal(renameStep(list, "2", " ")!.length, 1, "emptied text removes the step");
  assert.equal(removeStep(list, "1")!.length, 1);
  assert.equal(removeStep(removeStep(list, "1"), "2"), undefined);
});
