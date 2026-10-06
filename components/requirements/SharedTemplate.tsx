"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Users } from "lucide-react";
import Link from "next/link";
import { describeRules } from "@/lib/rules/describe";
import { universityName } from "@/lib/rules/shared";
import type { SubjectRules } from "@/lib/rules/types";
import type { Course } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { DialogActions } from "@/components/ui/Dialog";

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
  const { state } = shared;
  if (!state) return null;
  if (!state.university) {
    return (
      <p className="text-[13px] text-muted">
        Ha megadod az{" "}
        <Link href="/beallitasok#egyetem" className="font-semibold text-heading underline underline-offset-2">
          egyetemed
        </Link>
        , átveheted a szabályokat, amelyeket egy évfolyamtársad már beállított.
      </p>
    );
  }
  if (!course.code) {
    return <p className="text-[13px] text-muted">Adj meg tárgykódot (Tárgy szerkesztése), és átveheted a mások által már beállított szabályokat.</p>;
  }
  const t = state.template;
  if (!t) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-border bg-wash/[0.03] px-3 py-2.5">
      <Users className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      <p className="min-w-0 flex-1 text-[13.5px] text-foreground">
        Közösségi sablon ({universityName(state.university)}, {course.code}): {t.confirmations} hallgató megerősítette.
        {t.previous && <span className="text-muted"> Előző félévi, ellenőrizd.</span>}
      </p>
      <Button type="button" size="sm" onClick={() => onReview(t)}>
        Átnézem
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
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13.5px] text-muted">
        {offer.confirmations} hallgató megerősítette{offer.previous ? " az előző félévben" : ""}. Vesd össze a tárgy
        követelményrendszerével; ha valami nem stimmel, jelezd, és olvasd be a saját példányodat.
      </p>
      {describeRules(offer.rules).map((s) => (
        <div key={s.title}>
          <p className="text-[13px] font-semibold text-foreground">{s.title}</p>
          <ul className="mt-1 flex flex-col gap-1 text-[13.5px] text-foreground">
            {s.lines.map((l) => (
              <li key={l} className="flex items-start gap-1.5">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {offer.rules.flags.length > 0 && (
        <div>
          <p className="text-[13px] font-semibold text-foreground">Ellenőrizd</p>
          <ul className="mt-1 flex flex-col gap-1 text-[13.5px] text-foreground">
            {offer.rules.flags.map((f) => (
              <li key={f.field} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <DialogActions>
        <Button type="button" variant="ghost" onClick={onReport} className="mr-auto">
          Hibás a sablon
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Mégse
        </Button>
        <Button type="button" onClick={onSave}>
          Használom
        </Button>
      </DialogActions>
    </div>
  );
}
