"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { pushSnapshot } from "@/lib/subscription/client";

const DEBOUNCE_MS = 3000;

/**
 * While a calendar subscription exists, uploads the data to the server shortly after it
 * changes, so the subscribed calendar follows the site. Renders nothing.
 */
export function SubscriptionSync() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (useStore.getState().subscription && !useStore.getState().subscription?.lastPushedAt) {
      void pushSnapshot();
    }

    const unsubscribe = useStore.subscribe((state, prev) => {
      if (!state.subscription) {
        clearTimeout(timer);
        return;
      }
      // Only the data that ends up in the calendar; not notifiedKeys, push status, etc.
      const changed =
        state.courses !== prev.courses ||
        state.deadlines !== prev.deadlines ||
        state.feeds !== prev.feeds ||
        state.classSessions !== prev.classSessions ||
        state.timetableSources !== prev.timetableSources ||
        state.ignoredDuplicatePairs !== prev.ignoredDuplicatePairs ||
        state.customPlatforms !== prev.customPlatforms ||
        state.exportOptions !== prev.exportOptions;
      if (!changed) return;
      clearTimeout(timer);
      timer = setTimeout(() => void pushSnapshot({ onlyIfChanged: true }), DEBOUNCE_MS);
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  return null;
}
