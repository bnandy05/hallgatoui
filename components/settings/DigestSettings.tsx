"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { hu } from "date-fns/locale";
import { Loader2, Mail, ShieldAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { DIGEST_FREQUENCIES, type DigestFrequency, type DigestStatus } from "@/lib/digest";
import { deleteDigest, fetchDigest, saveDigest } from "@/lib/subscription/client";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Pill } from "@/components/ui/Pill";
import { SectionHeading } from "@/components/ui/SectionHeading";

type Load = { state: "loading" } | { state: "ready"; digest: DigestStatus | null; available: boolean } | { state: "error"; message: string };

/** Email digest: lives on the server next to the calendar subscription, so it needs one. */
export function DigestSettings() {
  const subscription = useStore((s) => s.subscription);
  const token = subscription?.token ?? null;

  return (
    <section id="hirlevel" className="flex flex-col gap-6">
      <SectionHeading
        title="E-mail-összefoglaló"
        sub="Heti vagy havi levél a közelgő és lejárt határidőkről, akkor is, ha az oldal nincs nyitva."
      />
      {token ? (
        <DigestForm key={token} />
      ) : (
        <div className="sheet-paper flex flex-col items-start gap-3 px-5 py-4">
          <p className="text-[14px] text-muted">
            Az összefoglalót a szerver állítja össze a naptár-előfizetésed adataiból, ezért előbb azt kell bekapcsolnod.
          </p>
          <Link href="/beallitasok#elofizetes" className={buttonClasses({ variant: "secondary", size: "sm" })}>
            Naptár-előfizetés
          </Link>
        </div>
      )}
    </section>
  );
}

function DigestForm() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState<DigestFrequency>("heti");
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchDigest().then((result) => {
      if (cancelled) return;
      if (result.error) {
        setLoad({ state: "error", message: result.error });
        return;
      }
      const digest = result.digest ?? null;
      setLoad({ state: "ready", digest, available: result.available !== false });
      if (digest) {
        setEmail(digest.email);
        setFrequency(digest.frequency);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (load.state === "loading") {
    return <div className="h-40 rounded-[var(--radius-slip)] bg-strip/80" />;
  }
  if (load.state === "error") {
    return <p className="text-[14px] font-semibold text-danger">{load.message}</p>;
  }
  if (!load.available) {
    return <p className="text-[14px] text-muted">Az e-mail-küldés ezen a szerveren nincs beállítva.</p>;
  }

  const digest = load.digest;
  const sameEmail = digest !== null && digest.email === email.trim().toLowerCase();
  // A pending sign-up can always be sent again (a new confirmation mail).
  const unchanged = sameEmail && digest.confirmed && digest.frequency === frequency;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy("save");
    setError(null);
    const result = await saveDigest(email, frequency);
    if (result.error) setError(result.error);
    else setLoad({ state: "ready", digest: result.digest ?? null, available: true });
    setBusy(null);
  }

  async function remove() {
    if (!confirm("Leiratkozol az e-mail-összefoglalóról? Az e-mail-címed törlődik a szerverről.")) return;
    setBusy("delete");
    setError(null);
    const result = await deleteDigest();
    if (result.error) setError(result.error);
    else {
      setLoad({ state: "ready", digest: null, available: true });
      setEmail("");
    }
    setBusy(null);
  }

  const status = !digest ? null : digest.confirmed ? (
    <p className="text-[13.5px] text-muted">
      <span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-success align-middle" />
      Feliratkozva
      {digest.lastSentAt &&
        `, utolsó levél ${formatDistanceToNow(new Date(digest.lastSentAt), { addSuffix: true, locale: hu })}`}
    </p>
  ) : (
    <p className="text-[13.5px] font-semibold text-warning">
      Megerősítésre vár: nyisd meg a {digest.email} címre küldött levelet (48 óráig érvényes).
    </p>
  );
  const spinner = <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <form onSubmit={submit} className="sheet-paper flex flex-col gap-4 px-5 py-5">
      {!digest && (
        <div className="flex gap-2.5 rounded-[var(--radius)] bg-canary/60 p-3 text-[13.5px] text-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Az e-mail-címed a naptár-előfizetés mellett a szerveren tárolódik, és csak az összefoglalóhoz használjuk.
            A feliratkozást egy levélben meg kell erősítened. Leiratkozáskor vagy az előfizetés kikapcsolásakor a cím
            törlődik.
          </p>
        </div>
      )}
      <div>
        <Label htmlFor="digest-email">E-mail-cím</Label>
        <Input
          id="digest-email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nev@example.hu"
        />
      </div>
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-heading">Gyakoriság</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Gyakoriság">
          {DIGEST_FREQUENCIES.map((f) => (
            <Pill key={f.id} active={frequency === f.id} onClick={() => setFrequency(f.id)}>
              {f.label}
            </Pill>
          ))}
        </div>
        <p className="mt-1.5 text-[13px] text-muted">
          Reggel érkezik, akkor is, ha épp nincs nyitott határidő.
        </p>
      </div>
      {status}
      {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy !== null || unchanged}>
          {busy === "save" ? spinner : <Mail className="h-4 w-4" />}
          {!digest
            ? "Feliratkozás"
            : !sameEmail
              ? "Új cím megerősítése"
              : digest.confirmed
                ? "Mentés"
                : "Megerősítő levél újraküldése"}
        </Button>
        {digest && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy !== null}
            onClick={() => void remove()}
            className="text-danger hover:!bg-danger/10 sm:ml-auto"
          >
            {busy === "delete" && spinner}
            Leiratkozás
          </Button>
        )}
      </div>
    </form>
  );
}
