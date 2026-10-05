"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { hardNavigate, safeReturnPath } from "@/lib/account/path";
import { dropForeignCache, login, register, requestMagicLink, requestPasswordReset } from "@/lib/account/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { SectionHeading } from "@/components/ui/SectionHeading";

type View = "belepes" | "regisztracio" | "link" | "jelszo" | "elkuldve";
type Sent = { email: string; minutes: string };

const TITLES: Record<Exclude<View, "elkuldve">, string> = {
  belepes: "Belépés",
  regisztracio: "Regisztráció",
  link: "Belépő link",
  jelszo: "Elfelejtett jelszó",
};

const SUBS: Record<Exclude<View, "elkuldve">, string> = {
  belepes: "Az adataid a fiókodhoz tartoznak, így bármelyik eszközödön ott vannak.",
  regisztracio: "Az e-mail-címedet egy levélben megerősítjük, utána használhatod a fiókot.",
  link: "Küldünk egy linket, amivel jelszó nélkül beléphetsz.",
  jelszo: "Küldünk egy linket, amivel új jelszót adhatsz meg.",
};

function Segment({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const items = [
    { id: "belepes", label: "Belépés" },
    { id: "regisztracio", label: "Regisztráció" },
  ] as const;
  return (
    <div role="group" aria-label="Belépés vagy regisztráció" className="grid grid-cols-2 gap-1 rounded-[var(--radius)] bg-inset p-1">
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
  const searchParams = useSearchParams();
  const back = safeReturnPath(searchParams.get("vissza"));
  const [view, setView] = useState<View>("belepes");
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
        setSent({ email: address, minutes: view === "regisztracio" ? "48 órán át" : "30 percig" });
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
      setSent({ email: email.trim(), minutes: "30 percig" });
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
        <SectionHeading title="Ellenőrizd a postafiókodat" />
        <p className="text-[15px] text-muted">
          Ha a {sent.email} címhez tartozik fiók, küldtünk oda egy levelet. A benne lévő link {sent.minutes} érvényes.
          Ha nem érkezik meg, ellenőrizd a levélszemét mappát is.
        </p>
        <Button variant="secondary" className="self-start" onClick={() => go("belepes")}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Vissza a belépéshez
        </Button>
      </Card>
    );
  }

  const current = view === "elkuldve" ? "belepes" : view;
  const showPassword = current === "belepes" || current === "regisztracio";
  const submitLabel = {
    belepes: "Belépés",
    regisztracio: "Regisztráció",
    link: "Link küldése",
    jelszo: "Link küldése",
  }[current];

  return (
    <Card as="form" onSubmit={submit} className="flex flex-col gap-5" noValidate={false}>
      <SectionHeading as="h1" title={TITLES[current]} sub={SUBS[current]} />

      {showPassword ? (
        <Segment view={current} onChange={go} />
      ) : (
        <button
          type="button"
          onClick={() => go("belepes")}
          className="-mt-2 inline-flex w-fit items-center gap-1.5 text-[14px] font-semibold text-muted hover:text-heading"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Vissza a belépéshez
        </button>
      )}

      <div>
        <Label htmlFor="auth-email">E-mail-cím</Label>
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
          <Label htmlFor="auth-password">Jelszó</Label>
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
              Legalább 10 karakter.
            </p>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-[14px] font-semibold text-danger">{error}</p>
          {unconfirmed && (
            <Button type="button" variant="secondary" size="sm" onClick={resend} disabled={busy}>
              Megerősítő link újraküldése
            </Button>
          )}
        </div>
      )}

      <Button type="submit" disabled={busy} className="w-full">
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </Button>

      {current === "belepes" && (
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
          <button type="button" onClick={() => go("link")} className="font-semibold text-heading underline underline-offset-2 hover:text-muted">
            Belépő link küldése e-mailben
          </button>
          <button type="button" onClick={() => go("jelszo")} className="font-semibold text-heading underline underline-offset-2 hover:text-muted">
            Elfelejtett jelszó
          </button>
        </div>
      )}
    </Card>
  );
}
