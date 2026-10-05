"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isAuthPath } from "@/lib/account/path";
import { startSync } from "@/lib/sync/engine";

/** Keeps the store and the server's data document in step (see lib/sync/engine.ts). Renders nothing. */
export function AccountSync() {
  const pathname = usePathname();
  const active = !isAuthPath(pathname);

  useEffect(() => {
    if (!active) return;
    return startSync();
  }, [active]);

  return null;
}
