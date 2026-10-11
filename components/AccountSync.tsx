"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isPublicPath } from "@/lib/account/path";
import { startSync } from "@/lib/sync/engine";
import { useDemoMode } from "@/lib/useDemoMode";

/** Keeps the store and the server's data document in step (see lib/sync/engine.ts). Renders nothing. */
export function AccountSync() {
  const pathname = usePathname();
  const demo = useDemoMode();
  // The demo has no account: nothing is ever sent to the server.
  const active = !isPublicPath(pathname) && !demo;

  useEffect(() => {
    if (!active) return;
    return startSync();
  }, [active]);

  return null;
}
