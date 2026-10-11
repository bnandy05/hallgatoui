import { cookies, headers } from "next/headers";
import { getMessages, isLocale, LOCALE_COOKIE, pickLocale, type Locale, type Messages } from "@/lib/i18n";

/** The request's language: the `hr_lang` cookie, else the browser's Accept-Language. */
export async function getLocale(): Promise<Locale> {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  return pickLocale((await headers()).get("accept-language"));
}

export async function getT(): Promise<Messages> {
  return getMessages(await getLocale());
}
