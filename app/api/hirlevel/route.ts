import { confirmDigest, unsubscribeDigest, type LinkResult } from "@/lib/server/digest";
import { parseToken, requireKv } from "@/lib/server/subscription";

// Confirm and unsubscribe links from the digest mails. The links open /hirlevel, whose button
// posts here (a GET never changes anything, so link scanners can't confirm or unsubscribe).
// Mail clients' one-click unsubscribe (RFC 8058) posts here with the parameters in the query.

async function handle(action: string, rawToken: string, key: string): Promise<LinkResult> {
  const kv = requireKv();
  const token = parseToken(rawToken);
  if (kv instanceof Response || !token || !key || key.length > 200) return "invalid";
  try {
    if (action === "megerosites") return await confirmDigest(kv, token, key, new Date());
    if (action === "leiratkozas") return await unsubscribeDigest(kv, token, key);
  } catch {
    return "invalid";
  }
  return "invalid";
}

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const oneClick = url.searchParams.get("m");
  if (oneClick) {
    const result = await handle(oneClick, url.searchParams.get("t") ?? "", url.searchParams.get("k") ?? "");
    return Response.json({ result }, { status: result === "ok" ? 200 : 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response("Hibás kérés", { status: 400 });
  }
  const action = String(form.get("m") ?? "");
  const result = await handle(action, String(form.get("t") ?? ""), String(form.get("k") ?? ""));
  const back = new URL("/hirlevel", url.origin);
  back.searchParams.set("m", action === "leiratkozas" ? "leiratkozas" : "megerosites");
  back.searchParams.set("eredmeny", result);
  return Response.redirect(back, 303);
}
