"use client";

import { useSyncExternalStore } from "react";
import { isDemoMode } from "@/lib/demoMode";

const noop = () => () => {};

/** True in the demo (no account, sample data). False during the server render. */
export function useDemoMode(): boolean {
  return useSyncExternalStore(noop, isDemoMode, () => false);
}
