import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";

/**
 * True once the store holds this user's data: from the cache of the same account, or from the
 * server after sign-in. Components that read AppData wait for this instead of `useHydrated()`;
 * device preferences (theme, showClasses, notification prefs) only need `useHydrated()`.
 */
export function useDataReady(): boolean {
  const hydrated = useHydrated();
  const owned = useStore((s) => s.ownerUserId !== null && s.ownerUserId === s.account?.userId);
  return hydrated && owned;
}
