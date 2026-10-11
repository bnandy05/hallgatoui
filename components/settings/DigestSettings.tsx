"use client";

import { useEffect, useState, type FormEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Mail } from "lucide-react";
import { DIGEST_FREQUENCIES, type DigestFrequency, type DigestStatus } from "@/lib/digest";
import { dateLocale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { deleteDigest, fetchDigest, saveDigest } from "@/lib/subscription/client";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { SectionHeading } from "@/components/ui/SectionHeading";

type Load =
  | { state: "loading" }
  | { state: "ready"; digest: DigestStatus | null; email: string; available: boolean }
  | { state: "error"; message: string };

/** Email digest: stored on the account, sent to the account's confirmed address. */
export function DigestSettings() {
  const t = useT();
  return (
    <section id="hirlevel" className="flex flex-col gap-6">
      <SectionHeading
        title={t.digest.title}
        sub={t.digest.sub}
      />
      <DigestForm />
    </section>
  );
}

function DigestForm() {
  const t = useT();
  const locale = useLocale();
  const [load, setLoad] = useState<Load>({ state: "loading" });
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
      setLoad({ state: "ready", digest, email: result.email ?? "", available: result.available !== false });
      if (digest) setFrequency(digest.frequency);
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
    return <p className="text-[14px] text-muted">{t.digest.notConfigured}</p>;
  }

  const { digest, email } = load;
  const unchanged = digest !== null && digest.frequency === frequency;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy("save");
    setError(null);
    const result = await saveDigest(frequency);
    if (result.error) setError(result.error);
    else setLoad({ state: "ready", digest: result.digest ?? null, email, available: true });
    setBusy(null);
  }

  async function remove() {
    if (!confirm(t.digest.confirmUnsubscribe)) return;
    setBusy("delete");
    setError(null);
    const result = await deleteDigest();
    if (result.error) setError(result.error);
    else setLoad({ state: "ready", digest: null, email, available: true });
    setBusy(null);
  }

  const spinner = <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <form onSubmit={submit} className="sheet-paper flex flex-col gap-4 px-5 py-5">
      <div>
        <p className="text-[13px] font-semibold text-heading">{t.digest.recipient}</p>
        <p className="mt-0.5 break-all text-[15px] text-foreground">{email}</p>
        <p className="mt-1 text-[13px] text-muted">{t.digest.recipientHint}</p>
      </div>
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-heading">{t.digest.frequency}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t.digest.frequency}>
          {DIGEST_FREQUENCIES.map((f) => (
            <Pill key={f.id} active={frequency === f.id} onClick={() => setFrequency(f.id)}>
              {t.digest.frequencies[f.id]}
            </Pill>
          ))}
        </div>
        <p className="mt-1.5 text-[13px] text-muted">
          {t.digest.morning}
        </p>
      </div>
      {digest && (
        <p className="text-[13.5px] text-muted">
          <span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-success align-middle" />
          {t.digest.subscribed}
          {digest.lastSentAt &&
            t.digest.lastSent(formatDistanceToNow(new Date(digest.lastSentAt), { addSuffix: true, locale: dateLocale(locale) }))}
        </p>
      )}
      {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy !== null || unchanged}>
          {busy === "save" ? spinner : <Mail className="h-4 w-4" />}
          {digest ? t.common.save : t.digest.subscribe}
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
            {t.digest.unsubscribe}
          </Button>
        )}
      </div>
    </form>
  );
}
