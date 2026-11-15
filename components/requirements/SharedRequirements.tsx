"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Users } from "lucide-react";
import Link from "next/link";
import { useT } from "@/lib/i18n/I18nProvider";
import { isDemoMode } from "@/lib/demoMode";
import { requirementCourseCode } from "@/lib/rules/courseCode";
import type { SharedRequirementOptions, TemplateOffer } from "@/lib/rules/shared";
import type { SubjectRules } from "@/lib/rules/types";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { RulesPreview } from "./RulesPreview";

const endpoint = "/api/kovetelmeny/sablon";

export function useSharedRequirements(code: string | undefined, semester: string | undefined) {
  const t = useT();
  const query = new URLSearchParams({ kod: code ?? "", felev: semester ?? "" }).toString();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ query: string; attempt: number; data: SharedRequirementOptions | null }>();

  useEffect(() => {
    if (isDemoMode()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`${endpoint}?${query}`, { signal: controller.signal })
        .then((r) => r.ok ? (r.json() as Promise<SharedRequirementOptions>) : null)
        .then((data) => {
          if (!controller.signal.aborted) setLoaded({ query, attempt, data });
        })
        .catch(() => {
          if (!controller.signal.aborted) setLoaded({ query, attempt, data: null });
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, attempt]);

  async function post(body: Record<string, unknown>): Promise<string | null> {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return null;
      const data = (await res.json()) as { error?: unknown };
      return typeof data.error === "string" ? data.error : t.errors.generic;
    } catch {
      return t.errors.network;
    }
  }

  const state = loaded?.query === query && loaded.attempt === attempt ? loaded.data : undefined;
  return {
    state,
    reload: () => setAttempt((prev) => prev + 1),
    publish: (code: string, rules: SubjectRules) => post({ kod: code, felev: semester, rules }),
    use: (offer: TemplateOffer) => post({ kod: offer.code, felev: offer.semester, variantId: offer.variantId }),
    report: (offer: TemplateOffer) => post({ kod: offer.code, felev: offer.semester, hibas: offer.variantId }),
  };
}

function PreviousSemester({ term }: { term: string }) {
  const t = useT().sharedTemplate;
  return (
    <p className="flex items-start gap-2 text-small font-medium text-heading">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {t.previousTerm(term.replaceAll("-", "/"))}
    </p>
  );
}

export function SharedRequirementsOffer({
  code,
  shared,
  onReview,
}: {
  code: string | undefined;
  shared: ReturnType<typeof useSharedRequirements>;
  onReview: () => void;
}) {
  const t = useT().sharedTemplate;
  const { state } = shared;
  const offer = state?.offers[0];

  if (!offer || !state) {
    const status = state === undefined ? t.loading
      : state === null ? t.unavailable
      : !state.university ? (
        <>
          {t.noUniversityBefore}
          <Link href="/beallitasok#egyetem" className="link-text">{t.noUniversityLink}</Link>
          {t.noUniversityAfter}
        </>
      ) : !requirementCourseCode(code) ? t.noCode : t.empty;
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-4">
        <p className="min-w-0 text-small text-muted" role="status">{status}</p>
        {state === null && <Button type="button" variant="ghost" size="sm" onClick={shared.reload}>{t.retry}</Button>}
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[var(--radius-slip)] bg-inset px-4 py-3">
      <div className="flex min-w-0 flex-1 basis-48 items-start gap-2.5">
        <Users className="mt-1 h-4 w-4 shrink-0 text-muted" aria-hidden />
        <div>
          <h4 className="text-body font-semibold text-heading">{t.heading}</h4>
          <p className="text-small text-muted">{t.offer(offer.confirmations, state.offers.length)}</p>
        </div>
      </div>
      <Button type="button" variant="secondary" onClick={onReview}>{t.review}</Button>
      {offer.previous && <div className="w-full rounded-[var(--radius-slip)] bg-canary px-3 py-2"><PreviousSemester term={offer.semester} /></div>}
    </div>
  );
}

export function SharedRequirementsReview({
  offers,
  onImport,
  onReport,
  onCancel,
}: {
  offers: TemplateOffer[];
  onImport: (offer: TemplateOffer) => Promise<string | null>;
  onReport: (offer: TemplateOffer) => Promise<string | null>;
  onCancel: () => void;
}) {
  const tAll = useT();
  const t = tAll.sharedTemplate;
  const [selected, setSelected] = useState(offers[0].variantId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offer = offers.find((v) => v.variantId === selected) ?? offers[0];

  async function act(action: typeof onImport) {
    setBusy(true);
    setError(null);
    const message = await action(offer);
    setBusy(false);
    setError(message);
  }

  return (
    <Dialog open onClose={() => { if (!busy) onCancel(); }} title={t.heading} size="lg">
      <div className="flex flex-col gap-4" aria-busy={busy}>
        {offers.length > 1 ? (
          <div>
            <Label htmlFor="shared-rule-version">{t.versionLabel}</Label>
            <Select
              id="shared-rule-version"
              value={offer.variantId}
              disabled={busy}
              onChange={(e) => { setSelected(e.target.value); setError(null); }}
            >
              {offers.map((v, i) => <option key={v.variantId} value={v.variantId}>{t.version(i + 1, v.confirmations)}</option>)}
            </Select>
          </div>
        ) : <p className="text-small text-muted">{t.usage(offer.confirmations)}</p>}
        {offer.previous && <div className="rounded-[var(--radius-slip)] bg-canary px-3 py-2"><PreviousSemester term={offer.semester} /></div>}
        <p className="text-small text-muted">{t.reviewIntro}</p>
        <div className="rounded-[var(--radius-slip)] bg-inset p-4">
          <RulesPreview rules={offer.rules} />
        </div>
        {error && <p className="text-small text-danger" role="alert">{error}</p>}
        <DialogActions>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void act(onReport)} className="sm:mr-auto">{t.report}</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>{tAll.common.cancel}</Button>
          <Button type="button" disabled={busy} onClick={() => void act(onImport)}>{t.use}</Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}
