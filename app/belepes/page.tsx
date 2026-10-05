import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Belépés" };

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-[460px] py-4 sm:py-10">
      <Suspense fallback={<div className="h-80 rounded-[var(--radius-slip)] bg-strip/80" />}>
        <AuthForm />
      </Suspense>
    </div>
  );
}
