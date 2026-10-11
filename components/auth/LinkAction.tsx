"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { hardNavigate } from "@/lib/account/path";
import { dropForeignCache, consumeLink } from "@/lib/account/client";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n/I18nProvider";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { SectionHeading } from "@/components/ui/SectionHeading";

type Kind = "megerosites" | "belepes" | "jelszo" | "email";

const KIND_IDS: readonly Kind[] = ["megerosites", "belepes", "jelszo", "email"];

const isKind = (value: string | null): value is Kind => value !== null && (KIND_IDS as readonly string[]).includes(value);

export function LinkAction() {
  const t = useT();
  const params = useSearchParams();
  const kind = params.get("m");
  const token = params.get("t");
  const signedIn = useStore((s) => s.account !== null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [emailChanged, setEmailChanged] = useState(false);

  if (!isKind(kind) || !token) return <Expired />;
  const copy = {
    megerosites: { title: t.auth.confirmEmailTitle, sub: t.auth.confirmEmailSub, button: t.auth.confirmButton },
    belepes: { title: t.auth.signIn, sub: t.auth.linkSignInSub, button: t.auth.signIn },
    jelszo: { title: t.auth.newPassword, sub: t.auth.newPasswordSub, button: t.auth.savePassword },
    email: { title: t.auth.changeEmailTitle, sub: t.auth.changeEmailSub, button: t.auth.confirmButton },
  }[kind];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !isKind(kind) || !token) return;
    setBusy(true);
    setError(null);
    setExpired(false);
    const result = await consumeLink(kind, token, kind === "jelszo" ? password : undefined);
    if (!result.ok) {
      if (result.code === "link_expired") setExpired(true);
      setError(result.error);
      setBusy(false);
      return;
    }
    if (kind === "email") {
      // An email-change link sets no session: the account does not sign in on this browser.
      setEmailChanged(true);
      setBusy(false);
      return;
    }
    await dropForeignCache();
    hardNavigate("/");
  }

  if (emailChanged) {
    return (
      <Card className="flex flex-col gap-4">
        <SectionHeading as="h1" title={t.auth.emailChanged} />
        <Link href={signedIn ? "/" : "/belepes"} className={buttonClasses({ className: "self-start" })}>
          {signedIn ? t.auth.continueToApp : t.auth.signIn}
        </Link>
      </Card>
    );
  }

  if (expired) return <Expired />;

  return (
    <Card as="form" onSubmit={submit} className="flex flex-col gap-5">
      <SectionHeading as="h1" title={copy.title} sub={copy.sub} />
      {kind === "jelszo" && (
        <div>
          <Label htmlFor="link-password">{t.auth.newPassword}</Label>
          <Input
            id="link-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={200}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="link-password-hint"
          />
          <p id="link-password-hint" className="mt-1.5 text-small text-muted">
            {t.auth.passwordHint}
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-body font-semibold text-danger">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {copy.button}
      </Button>
    </Card>
  );
}

function Expired() {
  const t = useT();
  return (
    <Card className="flex flex-col gap-4">
      <SectionHeading as="h1" title={t.auth.linkExpired} sub={t.auth.linkExpiredSub} />
      <Link href="/belepes" className={buttonClasses({ variant: "secondary", className: "self-start" })}>
        {t.auth.requestNewLink}
      </Link>
    </Card>
  );
}
