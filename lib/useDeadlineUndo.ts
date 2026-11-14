"use client";

import { useCallback } from "react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n/I18nProvider";
import { showToast } from "@/components/ui/Toast";
import type { Deadline } from "@/lib/types";

/**
 * Ticking off and deleting deadlines with an undo toast: snapshot the affected deadlines before
 * the action (for a tick that includes the dedupe-group followers the store changes with it),
 * run it, and offer `restoreDeadlines(snapshot)`.
 */
export function useDeadlineUndo() {
  const t = useT();

  const toggleDoneWithUndo = useCallback(
    (id: string) => {
      const { deadlines, toggleDone, restoreDeadlines } = useStore.getState();
      const before = new Map(deadlines.map((d) => [d.id, d]));
      const target = before.get(id);
      if (!target) return;
      toggleDone(id);
      // Whatever really changed (target plus followers), as it was.
      const snapshot = useStore
        .getState()
        .deadlines.filter((d) => before.get(d.id) && before.get(d.id)!.done !== d.done)
        .map((d) => before.get(d.id)!);
      showToast({
        message: target.done ? t.toast.reopened(target.title) : t.toast.done(target.title),
        actionLabel: t.toast.undo,
        onAction: () => restoreDeadlines(snapshot),
      });
    },
    [t]
  );

  const removeWithUndo = useCallback(
    (ids: string[]) => {
      const { deadlines, removeDeadlines, restoreDeadlines } = useStore.getState();
      const drop = new Set(ids);
      const snapshot: Deadline[] = deadlines.filter((d) => drop.has(d.id));
      if (snapshot.length === 0) return;
      removeDeadlines(ids);
      showToast({
        message: snapshot.length === 1 ? t.toast.deleted : t.toast.deletedMany(snapshot.length),
        actionLabel: t.toast.undo,
        onAction: () => restoreDeadlines(snapshot),
      });
    },
    [t]
  );

  return { toggleDoneWithUndo, removeWithUndo };
}
