"use client";

import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import Link from "next/link";
import { useT } from "@/lib/i18n/I18nProvider";
import { isDemoMode } from "@/lib/demoMode";
import { universityName } from "@/lib/rules/shared";
import type { SubjectRules } from "@/lib/rules/types";
import type { Course } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { DialogActions } from "@/components/ui/Dialog";
import { RulesPreview } from "./RulesPreview";

// Shared requirement templates: the rules another student at the same university already
// confirmed for this subject code and term. Looked up before reading the document, so a subject
// is extracted once; confirmed (or reported) after the student reviews them.

export interface TemplateOffer {
  variantId: string;
  rules: SubjectRules;
  confirmations: number;
  semester: string;
  previous: boolean;
  mine: boolean;
}

export interface SharedTemplateState {
  university: string | null;
  template: TemplateOffer | null;
}

export function useSharedTemplate(course: Course | undefined) {
  const [state, setState] = useState<SharedTemplateState | null>(null);
  const code = course?.code;
  const semester = course?.semester;

  useEffect(() => {
    if (isDemoMode()) return; // the demo never calls the server: no shared templates
    let cancelled = false;
    const params = new URLSearchParams({ kod: code ?? "", felev: semester ?? "" });
    void fetch(`/api/kovetelmeny/sablon?${params}`)
      .then((r) => (r.ok ? (r.json() as Promise<SharedTemplateState>) : null))
      .then((d) => !cancelled && setState(d))
      .catch(() => !cancelled && setState(null));
    return () => {
      cancelled = true;
    };
  }, [code, semester]);

  const post = useCallback(
    (body: Record<string, unknown>) =>
      fetch("/api/kovetelmeny/sablon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kod: code, felev: semester, ...body }),
      })
        .then((r) => r.ok)
        .catch(() => false),
    [code, semester]
  );

  return {
    state,
    canShare: !!state?.university && !!code,
    /** Confirms (or first publishes) these rules for the subject; fire and forget. */
    publish: (rules: SubjectRules) => void post({ rules }),
    report: (offer: TemplateOffer) => post({ felev: offer.semester, hibas: offer.variantId }),
  };
}

/** The line in the empty rules panel: an offer, or what's missing for one. */
export function SharedTemplateOffer({
  course,
  shared,
  onReview,
}: {
  course: Course;
  shared: ReturnType<typeof useSharedTemplate>;
  onReview: (offer: TemplateOffer) => void;
}) {
  const t = useT().sharedTemplate;
  const { state } = shared;
  if (!state) return null;
  if (!state.university) {
    return (
      <p className="text-small text-muted">
        {t.noUniversityBefore}
        <Link href="/beallitasok#egyetem" className="link-text">
          {t.noUniversityLink}
        </Link>
        {t.noUniversityAfter}
      </p>
    );
  }
  if (!course.code) {
    return <p className="text-small text-muted">{t.noCode}</p>;
  }
  const offer = state.template;
  if (!offer) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-border bg-wash/[0.03] px-3 py-2.5">
      <Users className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      <p className="min-w-0 flex-1 text-small text-foreground">
        {t.offer(universityName(state.university), course.code, offer.confirmations)}
        {offer.previous && <span className="text-muted">{t.previousTerm}</span>}
      </p>
      <Button type="button" size="sm" onClick={() => onReview(offer)}>
        {t.review}
      </Button>
    </div>
  );
}

/** Review of a shared template before it becomes the course's rules. */
export function TemplateReview({
  offer,
  onSave,
  onReport,
  onCancel,
}: {
  offer: TemplateOffer;
  onSave: () => void;
  onReport: () => void;
  onCancel: () => void;
}) {
  const tAll = useT();
  const t = tAll.sharedTemplate;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-muted">{t.reviewIntro(offer.confirmations, offer.previous)}</p>
      <div className="rounded-[var(--radius-slip)] bg-inset px-4 py-4">
        <RulesPreview rules={offer.rules} />
      </div>
      <DialogActions>
        <Button type="button" variant="ghost" onClick={onReport} className="mr-auto">
          {t.report}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {tAll.common.cancel}
        </Button>
        <Button type="button" onClick={onSave}>
          {t.use}
        </Button>
      </DialogActions>
    </div>
  );
}
