"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n/I18nProvider";
import { deadlineIdentity } from "@/lib/ical/dedupe";
import { useDeadlineUndo } from "@/lib/useDeadlineUndo";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { showToast } from "@/components/ui/Toast";

// A calendar event's "Késznek jelölöm" link (/?kesz=<deadlineIdentity>): the link only opens the app,
// the tick happens after the confirmation, with the usual undo toast. Waits for this tab's first
// server pull, so it ticks the account's current deadline (identities are the same on every device).

export function MarkDoneLink() {
  const t = useT();
  const pulled = useStore((s) => s.pulledThisSession);
  const { confirm, dialog } = useConfirm();
  const { toggleDoneWithUndo } = useDeadlineUndo();
  const handled = useRef(false);

  useEffect(() => {
    if (!pulled || handled.current) return;
    const params = new URLSearchParams(window.location.search);
    const identity = params.get("kesz");
    if (!identity) return;
    handled.current = true;
    params.delete("kesz");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);

    const deadline = useStore.getState().deadlines.find((d) => deadlineIdentity(d) === identity);
    if (!deadline) {
      showToast({ message: t.calendarLinks.notFound });
      return;
    }
    if (deadline.done) {
      showToast({ message: t.calendarLinks.alreadyDone(deadline.title) });
      return;
    }
    void confirm({ title: t.calendarLinks.doneTitle, message: deadline.title, confirmLabel: t.calendarLinks.doneConfirm, tone: "default" }).then(
      (ok) => {
        if (ok) toggleDoneWithUndo(deadline.id);
      }
    );
  }, [pulled, confirm, toggleDoneWithUndo, t]);

  return dialog;
}
