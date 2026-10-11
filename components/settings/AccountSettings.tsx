"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, LogOut } from "lucide-react";
import { useStore } from "@/lib/store";
import { changeEmail, changePassword, deleteAccount, fetchMe, signOut } from "@/lib/account/client";
import { useT } from "@/lib/i18n/I18nProvider";
import { flushSync } from "@/lib/sync/engine";
import { SyncStatus } from "@/components/SyncStatus";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { SectionHeading } from "@/components/ui/SectionHeading";

type Notice = { tone: "ok" | "bad"; text: string } | null;

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p role={notice.tone === "bad" ? "alert" : "status"} className={`text-[14px] ${notice.tone === "bad" ? "font-semibold text-danger" : "text-muted"}`}>
      {notice.text}
    </p>
  );
}

export function AccountSettings() {
  const t = useT();
  const account = useStore((s) => s.account);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMe().then((me) => {
      if (!cancelled && me.ok) setHasPassword(me.user.hasPassword);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!account) return <div className="h-40 rounded-[var(--radius-slip)] bg-strip/80" />;

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <SectionHeading title={t.account.title} sub={t.account.sub} />
        <Card className="flex flex-col gap-4">
          <div>
            <p className="text-[13px] font-semibold text-heading">{t.account.email}</p>
            <p className="mt-0.5 break-all text-[15px] text-foreground">{account.email}</p>
          </div>
          <SyncStatus />
        </Card>
        <EmailForm />
      </section>

      <PasswordForm hasPassword={hasPassword} onSet={() => setHasPassword(true)} />

      <section className="flex flex-col gap-4">
        <SectionHeading title={t.account.signOutTitle} />
        <SignOutButtons />
      </section>

      <DeleteSection email={account.email} />
    </div>
  );
}

function EmailForm() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const result = await changeEmail(email.trim());
    if (result.ok) {
      setNotice({ tone: "ok", text: t.account.emailSent });
      setEmail("");
    } else {
      setNotice({ tone: "bad", text: result.error });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="sheet-paper flex flex-col gap-3 p-5">
      <div>
        <Label htmlFor="account-new-email">{t.account.newEmail}</Label>
        <Input
          id="account-new-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <NoticeLine notice={notice} />
      <Button type="submit" variant="secondary" size="sm" className="self-start" disabled={busy || email.trim() === ""}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {t.account.changeEmail}
      </Button>
    </form>
  );
}

function PasswordForm({ hasPassword, onSet }: { hasPassword: boolean | null; onSet: () => void }) {
  const t = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const result = await changePassword(hasPassword ? current : undefined, next);
    if (result.ok) {
      setNotice({ tone: "ok", text: t.account.passwordSaved });
      setCurrent("");
      setNext("");
      onSet();
    } else {
      setNotice({ tone: "bad", text: result.error });
    }
    setBusy(false);
  }

  return (
    <section className="flex flex-col gap-4">
      <SectionHeading
        title={hasPassword === false ? t.account.setPassword : t.account.password}
        sub={hasPassword === false ? t.account.setPasswordSub : undefined}
      />
      <form onSubmit={submit} className="sheet-paper flex flex-col gap-3 p-5">
        {hasPassword && (
          <div>
            <Label htmlFor="account-current-password">{t.account.currentPassword}</Label>
            <Input
              id="account-current-password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={200}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
        )}
        <div>
          <Label htmlFor="account-new-password">{t.account.newPassword}</Label>
          <Input
            id="account-new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={200}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-describedby="account-password-hint"
          />
          <p id="account-password-hint" className="mt-1.5 text-[13px] text-muted">
            {t.account.passwordHint}
          </p>
        </div>
        <NoticeLine notice={notice} />
        <Button type="submit" variant="secondary" size="sm" className="self-start" disabled={busy || hasPassword === null}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {t.account.savePassword}
        </Button>
      </form>
    </section>
  );
}

function SignOutButtons() {
  const t = useT();
  const [busy, setBusy] = useState<"one" | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(everywhere: boolean) {
    setBusy(everywhere ? "all" : "one");
    setError(null);
    await flushSync(); // best effort: the last edits reach the server before the cache is dropped
    const failed = await signOut(everywhere);
    if (failed) {
      setError(failed);
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => run(false)} disabled={busy !== null}>
          {busy === "one" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
          {t.account.signOut}
        </Button>
        <Button variant="secondary" onClick={() => run(true)} disabled={busy !== null}>
          {busy === "all" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {t.account.signOutEverywhere}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-[14px] font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function DeleteSection({ email }: { email: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col gap-4">
      <SectionHeading
        title={t.account.deleteTitle}
        sub={t.account.deleteSub}
      />
      <Button variant="danger" className="self-start" onClick={() => setOpen(true)}>
        {t.account.deleteTitle}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t.account.deleteTitle}>
        <DeleteForm email={email} onCancel={() => setOpen(false)} />
      </Dialog>
    </section>
  );
}

function DeleteForm({ email, onCancel }: { email: string; onCancel: () => void }) {
  const t = useT();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!matches) return;
    setBusy(true);
    setError(null);
    const failed = await deleteAccount(typed.trim());
    if (failed) {
      setError(failed);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-[14.5px] text-muted">
        {t.account.deleteText}<strong className="break-all text-heading">{email}</strong>
      </p>
      <div>
        <Label htmlFor="delete-email">{t.account.email}</Label>
        <Input
          id="delete-email"
          type="email"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-[14px] font-semibold text-danger">
          {error}
        </p>
      )}
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          {t.common.cancel}
        </Button>
        <Button type="submit" variant="danger" disabled={!matches || busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {t.account.deleteForever}
        </Button>
      </DialogActions>
    </form>
  );
}
