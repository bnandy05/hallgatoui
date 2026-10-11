"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { hardNavigate, safeReturnPath } from "@/lib/account/path";
import { dropForeignCache, login, register, requestMagicLink, requestPasswordReset } from "@/lib/account/client";
import { useT } from "@/lib/i18n/I18nProvider";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { SectionHeading } from "@/components/ui/SectionHeading";

type View = "belepes" | "regisztracio" | "link" | "jelszo" | "elkuldve";
type Sent = { email: string; long: boolean };

function Segment({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const t = useT();
  const items = [
    { id: "belepes", label: t.auth.signIn },
    { id: "regisztracio", label: t.auth.register },
  ] as const;
  return (
    <div role="group" aria-label={t.auth.signInOrRegister} className="grid grid-cols-2 gap-1 rounded-[var(--radius)] bg-inset p-1">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={view === item.id}
          onClick={() => onChange(item.id)}
          className={`h-9 rounded-[calc(var(--radius)-2px)] text-[14px] font-semibold transition-colors duration-150 ${
            view === item.id ? "bg-card text-heading shadow-[var(--shadow-paper)]" : "text-muted hover:text-heading"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function AuthForm() {
  const t = useT();
  const searchParams = useSearchParams();
  const back = safeReturnPath(searchParams.get("vissza"));
  // ?mod=regisztracio opens the registration form (the demo's "Register" links here).
  const [view, setView] = useState<View>(searchParams.get("mod") === "regisztracio" ? "regisztracio" : "belepes");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);

  function go(next: View) {
    setView(next);
    setError(null);
    setUnconfirmed(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (view === "elkuldve" || busy) return;
    setBusy(true);
    setError(null);
    setUnconfirmed(false);
    const address = email.trim();

    if (view === "belepes") {
      const result = await login(address, password);
      if (result.ok) {
        await dropForeignCache();
        hardNavigate(back);
        return; // stay busy while the page changes
      }
      setError(result.error);
      setUnconfirmed(result.status === 403);
    } else {
      const result =
        view === "regisztracio"
          ? await register(address, password)
          : view === "link"
            ? await requestMagicLink(address)
            : await requestPasswordReset(address);
      if (result.ok) {
        setSent({ email: address, long: view === "regisztracio" });
        setView("elkuldve");
      } else {
        setError(result.error);
      }
    }
    setBusy(false);
  }

  async function resend() {
    setBusy(true);
    setError(null);
    const result = await requestMagicLink(email.trim());
    if (result.ok) {
      setSent({ email: email.trim(), long: false });
      setView("elkuldve");
      setUnconfirmed(false);
    } else {
      setError(result.error);
    }
    setBusy(false);
  }

  if (view === "elkuldve" && sent) {
    return (
      <Card className="flex flex-col gap-4">
        <MailCheck className="h-6 w-6 text-heading" aria-hidden="true" />
        <SectionHeading title={t.auth.checkInbox} />
        <p className="text-[15px] text-muted">
          {t.auth.sentText(sent.email, sent.long ? t.auth.validity48h : t.auth.validity30m)}
        </p>
        <Button variant="secondary" className="self-start" onClick={() => go("belepes")}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t.auth.backToSignIn}
        </Button>
      </Card>
    );
  }

  const current = view === "elkuldve" ? "belepes" : view;
  const showPassword = current === "belepes" || current === "regisztracio";
  const submitLabel = {
    belepes: t.auth.signIn,
    regisztracio: t.auth.register,
    link: t.auth.sendLink,
    jelszo: t.auth.sendLink,
  }[current];
  const titles = { belepes: t.auth.signIn, regisztracio: t.auth.register, link: t.auth.magicLink, jelszo: t.auth.forgotPassword };
  const subs = {
    belepes: t.auth.signInSub,
    regisztracio: t.auth.registerSub,
    link: t.auth.magicLinkSub,
    jelszo: t.auth.forgotPasswordSub,
  };

  return (
    <Card as="form" onSubmit={submit} className="flex flex-col gap-5" noValidate={false}>
      <SectionHeading as="h1" title={titles[current]} sub={subs[current]} actions={<LanguageToggle />} />

      {showPassword ? (
        <Segment view={current} onChange={go} />
      ) : (
        <button
          type="button"
          onClick={() => go("belepes")}
          className="-mt-2 inline-flex w-fit items-center gap-1.5 text-[14px] font-semibold text-muted hover:text-heading"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t.auth.backToSignIn}
        </button>
      )}

      <div>
        <Label htmlFor="auth-email">{t.auth.email}</Label>
        <Input
          id="auth-email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {showPassword && (
        <div>
          <Label htmlFor="auth-password">{t.auth.password}</Label>
          <Input
            id="auth-password"
            type="password"
            name="password"
            autoComplete={current === "belepes" ? "current-password" : "new-password"}
            required
            minLength={current === "regisztracio" ? 10 : undefined}
            maxLength={200}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={current === "regisztracio" ? "auth-password-hint" : undefined}
          />
          {current === "regisztracio" && (
            <p id="auth-password-hint" className="mt-1.5 text-[13px] text-muted">
              {t.auth.passwordHint}
            </p>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-[14px] font-semibold text-danger">{error}</p>
          {unconfirmed && (
            <Button type="button" variant="secondary" size="sm" onClick={resend} disabled={busy}>
              {t.auth.resendConfirmation}
            </Button>
          )}
        </div>
      )}

      <Button type="submit" disabled={busy} className="w-full">
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </Button>

      {current === "regisztracio" && (
        <p className="text-[13px] text-muted">
          {t.auth.privacyBefore}
          <Link href="/adatvedelem" className="font-semibold text-heading underline underline-offset-2 hover:text-muted">
            {t.auth.privacyLink}
          </Link>
          .
        </p>
      )}

      {current === "belepes" && (
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
          <button type="button" onClick={() => go("link")} className="font-semibold text-heading underline underline-offset-2 hover:text-muted">
            {t.auth.sendMagicLink}
          </button>
          <button type="button" onClick={() => go("jelszo")} className="font-semibold text-heading underline underline-offset-2 hover:text-muted">
            {t.auth.forgotPassword}
          </button>
        </div>
      )}
    </Card>
  );
}
