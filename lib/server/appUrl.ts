// The public origin used in email links. Prefers configuration over the request's Host header,
// so links in mails always point at the real site. Server-only.

export function publicAppUrl(req: Request): string {
  const configured = process.env.APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return new URL(req.url).origin;
}
