import type { MetadataRoute } from "next";
import { getT, getLocale } from "@/lib/i18n/server";
import { THEME_COLOR } from "@/lib/theme";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [locale, t] = await Promise.all([getLocale(), getT()]);
  return {
    name: t.shell.brand,
    short_name: "Hallgatói",
    description: t.meta.manifestDescription,
    lang: locale,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: THEME_COLOR.light,
    theme_color: THEME_COLOR.light,
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
