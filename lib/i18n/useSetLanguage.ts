"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "@/lib/i18n";
import { setAccountLanguage } from "@/lib/account/client";
import { useStore } from "@/lib/store";
import { clearOfflineCache } from "@/lib/sw";

/**
 * The one place a language switch happens: sets the cookie, saves the choice on the account when
 * signed in (so mails and the subscribed calendar follow, on every device), drops the service
 * worker's cached pages (they differ per language), then refreshes so the server renders the
 * new language. Signed out (the sign-in page) it is the cookie only.
 */
export function useSetLanguage(): (locale: Locale) => Promise<void> {
  const router = useRouter();
  const signedIn = useStore((s) => s.account !== null);
  return useCallback(
    async (locale: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
      clearOfflineCache();
      if (signedIn) await setAccountLanguage(locale); // best effort: the cookie already switched this browser
      router.refresh();
    },
    [router, signedIn],
  );
}
