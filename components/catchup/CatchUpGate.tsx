"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { shouldPrompt, type CatchUpGroup } from "@/lib/catchup";
import { onCatchUpOpen } from "@/lib/catchupEvents";
import { useCatchUpData } from "@/lib/useCatchUp";
import { CatchUpDialog } from "@/components/catchup/CatchUpDialog";

// Opens the catch-up popup: by itself once this tab has the server's data and something ended
// after the popup was last closed (account-wide), from the reminders or the course page, and
// from the digest's link (/?potlas=1). "Később" in a tab keeps it closed for that tab session.

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
  const { pending } = useCatchUpData();
  const pulled = useStore((s) => s.pulledThisSession);
  const promptedUntil = useStore((s) => s.catchUp?.promptedUntil);
  const markCatchUpPrompted = useStore((s) => s.markCatchUpPrompted);
  const [shown, setShown] = useState<CatchUpGroup[] | null>(null);
  const pendingRef = useRef(pending);
  const fromLinkRef = useRef(false);
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
    if (params.get("potlas") === "1") {
      fromLinkRef.current = true;
      params.delete("potlas");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    }
    const fromLink = fromLinkRef.current;
    const open = fromLink ? pending.length > 0 : !dismissedThisTab() && shouldPrompt(pending, promptedUntil);
    if (!open) return;
    // Opened from a timer, not during the effect: the page settles first.
    const timer = setTimeout(() => {
      fromLinkRef.current = false;
      setShown(pending);
    }, 300);
    return () => clearTimeout(timer);
  }, [pulled, pending, promptedUntil, shown]);

  function close() {
    setShown(null);
    rememberDismissed();
    markCatchUpPrompted();
  }

  return <CatchUpDialog open={shown !== null} onClose={close} groups={shown ?? []} />;
}
