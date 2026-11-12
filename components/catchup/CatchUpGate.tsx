"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { shouldPrompt, type CatchUpGroup } from "@/lib/catchup";
import { onCatchUpOpen } from "@/lib/catchupEvents";
import { useCatchUpData } from "@/lib/useCatchUp";
import { useT } from "@/lib/i18n/I18nProvider";
import { CatchUpDialog } from "@/components/catchup/CatchUpDialog";
import { showToast } from "@/components/ui/Toast";

// Opens the catch-up popup: by itself once this tab has the server's data and something ended
// after the popup was last closed (account-wide), from the reminders or the course page, and
// from the digest's link (/?potlas=1) and a calendar event's link (/?potlas=<group key>: just that
// class or deadline, or a toast when it has nothing to record). "Később" in a tab keeps it closed for that tab session.

const DISMISSED_KEY = "hr:catchup-dismissed";

function dismissedThisTab(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    sessionStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // private mode: the account-level time still stops it re-opening
  }
}

export function CatchUpGate() {
  const t = useT();
  const { pending } = useCatchUpData();
  const pulled = useStore((s) => s.pulledThisSession);
  const promptedUntil = useStore((s) => s.catchUp?.promptedUntil);
  const markCatchUpPrompted = useStore((s) => s.markCatchUpPrompted);
  const [shown, setShown] = useState<CatchUpGroup[] | null>(null);
  const pendingRef = useRef(pending);
  /** Set by a link: null for everything pending, or one group's key. */
  const fromLinkRef = useRef<{ group: string | null } | null>(null);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  // Explicit requests: the reminders, the course page, the digest link.
  useEffect(() => {
    const off = onCatchUpOpen(({ groupKey }) => {
      const groups = pendingRef.current.filter((g) => !groupKey || g.key === groupKey);
      if (groups.length > 0) setShown(groups);
    });
    return off;
  }, []);

  useEffect(() => {
    if (!pulled || shown) return;
    const params = new URLSearchParams(window.location.search);
    const param = params.get("potlas");
    if (param) {
      fromLinkRef.current = { group: param === "1" ? null : param };
      params.delete("potlas");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    }
    const fromLink = fromLinkRef.current;
    const groups = fromLink?.group ? pending.filter((g) => g.key === fromLink.group) : pending;
    if (fromLink?.group && groups.length === 0) {
      fromLinkRef.current = null;
      showToast({ message: t.calendarLinks.nothingToRecord });
      return;
    }
    const open = fromLink ? groups.length > 0 : !dismissedThisTab() && shouldPrompt(pending, promptedUntil);
    if (!open) return;
    // Opened from a timer, not during the effect: the page settles first.
    const timer = setTimeout(() => {
      fromLinkRef.current = null;
      setShown(groups);
    }, 300);
    return () => clearTimeout(timer);
  }, [pulled, pending, promptedUntil, shown, t]);

  function close() {
    setShown(null);
    rememberDismissed();
    markCatchUpPrompted();
  }

  return <CatchUpDialog open={shown !== null} onClose={close} groups={shown ?? []} />;
}
