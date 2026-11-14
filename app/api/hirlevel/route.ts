import { getMessages } from "@/lib/i18n";
import { requestLocale } from "@/lib/server/locale";
import { getAccountStore } from "@/lib/server/account/store";
import { unsubscribeDigest, type LinkResult } from "@/lib/server/digest";
import { unsubscribeAlerts } from "@/lib/server/gradeAlerts";

// Unsubscribe links from the digest mails. The link opens /hirlevel, whose button posts here
// (a GET never changes anything, so link scanners can't unsubscribe). Mail clients' one-click
// unsubscribe (RFC 8058) posts here with the parameters in the query. `m=leiratkozas` turns the
// digest off, `m=riaszto` only the emailed grade alerts.

async function handle(action: string, userId: string, key: string): Promise<LinkResult> {
  const store = getAccountStore();
  if (!store || (action !== "leiratkozas" && action !== "riaszto") || !userId || userId.length > 100 || !key || key.length > 200) {
    return "invalid";
  }
  try {
    return await (action === "riaszto" ? unsubscribeAlerts : unsubscribeDigest)(store.kv, userId, key);
  } catch {
    return "invalid";
  }
}

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const oneClick = url.searchParams.get("m");
  if (oneClick) {
    const result = await handle(oneClick, url.searchParams.get("u") ?? "", url.searchParams.get("k") ?? "");
    return Response.json({ result }, { status: result === "ok" ? 200 : 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response(getMessages(requestLocale(req)).errors.bad_request, { status: 400 });
  }
  const action = String(form.get("m") ?? "");
  const result = await handle(action, String(form.get("u") ?? ""), String(form.get("k") ?? ""));
  const back = new URL("/hirlevel", url.origin);
  back.searchParams.set("m", action === "riaszto" ? "riaszto" : "leiratkozas");
  back.searchParams.set("eredmeny", result);
  return Response.redirect(back, 303);
}
