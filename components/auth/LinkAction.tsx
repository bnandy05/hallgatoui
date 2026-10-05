"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { hardNavigate } from "@/lib/account/path";
import { dropForeignCache, consumeLink } from "@/lib/account/client";
import { useStore } from "@/lib/store";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { SectionHeading } from "@/components/ui/SectionHeading";

type Kind = "megerosites" | "belepes" | "jelszo" | "email";

const KINDS: Record<Kind, { title: string; sub: string; button: string }> = {
  megerosites: {
    title: "E-mail-cím megerősítése",
    sub: "Erősítsd meg a címedet, utána be is léptetünk.",
    button: "Megerősítem",
  },
  belepes: { title: "Belépés", sub: "Lépj be a fiókodba ezzel a linkkel.", button: "Belépés" },
  jelszo: { title: "Új jelszó", sub: "Add meg az új jelszavad, utána be is léptetünk.", button: "Jelszó mentése" },
  email: {
    title: "E-mail-cím módosítása",
    sub: "Erősítsd meg, hogy az új cím a fiókodhoz tartozzon.",
    button: "Megerősítem",
  },
};

const isKind = (value: string | null): value is Kind => value !== null && value in KINDS;

export function LinkAction() {
  const params = useSearchParams();
  const kind = params.get("m");
  const token = params.get("t");
  const signedIn = useStore((s) => s.account !== null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailChanged, setEmailChanged] = useState(false);

  if (!isKind(kind) || !token) return <Expired />;
  const copy = KINDS[kind];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !isKind(kind) || !token) return;
    setBusy(true);
    setError(null);
    const result = await consumeLink(kind, token, kind === "jelszo" ? password : undefined);
    if (!result.ok) {
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
        <SectionHeading as="h1" title="Az e-mail-címed megváltozott." />
        <Link href={signedIn ? "/" : "/belepes"} className={buttonClasses({ className: "self-start" })}>
          {signedIn ? "Tovább az oldalra" : "Belépés"}
        </Link>
      </Card>
    );
  }

  const expired = error === "A link lejárt vagy már felhasználták";
  if (expired) return <Expired />;

  return (
    <Card as="form" onSubmit={submit} className="flex flex-col gap-5">
      <SectionHeading as="h1" title={copy.title} sub={copy.sub} />
      {kind === "jelszo" && (
        <div>
          <Label htmlFor="link-password">Új jelszó</Label>
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
          <p id="link-password-hint" className="mt-1.5 text-[13px] text-muted">
            Legalább 10 karakter.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[14px] font-semibold text-danger">
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
  return (
    <Card className="flex flex-col gap-4">
      <SectionHeading as="h1" title="A link lejárt vagy már felhasználták" sub="Kérj egy újat a belépő oldalon." />
      <Link href="/belepes" className={buttonClasses({ variant: "secondary", className: "self-start" })}>
        Új link kérése
      </Link>
    </Card>
  );
}
