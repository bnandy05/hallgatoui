import { Suspense } from "react";
import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { AuthForm } from "@/components/auth/AuthForm";
import { DemoEntry } from "@/components/demo/DemoEntry";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.meta.signIn };
}

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-[460px] py-4 sm:py-10">
      <Suspense fallback={<div className="h-80 rounded-[var(--radius-slip)] bg-strip/80" />}>
        <AuthForm />
      </Suspense>
      <DemoEntry />
    </div>
  );
}
