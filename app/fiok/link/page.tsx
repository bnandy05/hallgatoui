import { Suspense } from "react";
import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { LinkAction } from "@/components/auth/LinkAction";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.meta.account };
}

export default function AccountLinkPage() {
  return (
    <div className="mx-auto w-full max-w-[460px] py-4 sm:py-10">
      <Suspense fallback={<div className="h-56 rounded-[var(--radius-slip)] bg-strip/80" />}>
        <LinkAction />
      </Suspense>
    </div>
  );
}
