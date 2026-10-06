"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { catchUpNotification, dueNotifications } from "@/lib/notifications";
import { applyDedupe } from "@/lib/ical/dedupe";
import { linkedInstances, pendingInputs } from "@/lib/catchup";
import { openCatchUp } from "@/lib/catchupEvents";

const CHECK_INTERVAL_MS = 60 * 1000;

/**
 * Fires browser notifications for approaching deadlines. There is no backend or service
 * worker, so this only works while the app is open in a tab.
 */
export function NotificationScheduler() {
  const router = useRouter();

  useEffect(() => {
    function check() {
      try {
        if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      } catch {
        return;
      }
      const state = useStore.getState();
      const { notificationPrefs, notifiedKeys, courses, markNotified } = state;
      if (!notificationPrefs.enabled) return;

      // One notification per merged deadline, not one per source.
      const { visible: deadlines } = applyDedupe(
        state.deadlines,
        state.feeds,
        state.ignoredDuplicatePairs,
        state.exportOptions.dedupe,
        courses
      );
      const pending = dueNotifications(
        deadlines,
        courses,
        notificationPrefs,
        new Set(notifiedKeys),
        new Date()
      );
      const sent: string[] = [];
      for (const item of pending) {
        try {
          const n = new Notification(item.title, {
            body: item.body,
            tag: item.keys[0],
            icon: "/favicon.ico",
          });
          n.onclick = () => {
            window.focus();
            router.push(item.href);
            n.close();
          };
          sent.push(...item.keys);
        } catch {
          // Some mobile browsers throw on the constructor: treat as unsupported, stop here.
          break;
        }
      }
      // After the day's last linked class: one reminder to record what happened.
      const now = new Date();
      const catchUpInput = {
        courses,
        rules: state.requirementRules,
        results: state.requirementResults,
        sessions: state.classSessions,
        deadlines: state.deadlines,
        semester: state.semester,
        now,
      };
      const linked = linkedInstances(catchUpInput);
      const notice = catchUpNotification(linked, pendingInputs(catchUpInput, linked), new Set(notifiedKeys), now);
      if (notice) {
        try {
          const n = new Notification(notice.title, { body: notice.body, tag: notice.key, icon: "/favicon.ico" });
          n.onclick = () => {
            window.focus();
            openCatchUp();
            n.close();
          };
          sent.push(notice.key);
        } catch {
          // unsupported constructor: nothing to do
        }
      }
      if (sent.length > 0) markNotified(sent);
    }

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    function handleVisibility() {
      if (document.visibilityState === "visible") check();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [router]);

  return null;
}
