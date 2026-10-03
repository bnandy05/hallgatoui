"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { dueNotifications } from "@/lib/notifications";

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
      const { notificationPrefs, notifiedKeys, deadlines, courses, markNotified } =
        useStore.getState();
      if (!notificationPrefs.enabled) return;

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
