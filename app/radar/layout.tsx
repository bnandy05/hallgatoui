import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.meta.deadlines };
}

export default function RadarLayout({ children }: LayoutProps<"/radar">) {
  return children;
}
