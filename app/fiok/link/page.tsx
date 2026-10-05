import { Suspense } from "react";
import type { Metadata } from "next";
import { LinkAction } from "@/components/auth/LinkAction";

export const metadata: Metadata = { title: "Fiók" };

export default function AccountLinkPage() {
  return (
    <div className="mx-auto w-full max-w-[460px] py-4 sm:py-10">
      <Suspense fallback={<div className="h-56 rounded-[var(--radius-slip)] bg-strip/80" />}>
        <LinkAction />
      </Suspense>
    </div>
  );
}
