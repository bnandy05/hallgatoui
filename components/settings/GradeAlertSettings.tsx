"use client";

import Link from "next/link";
import { BellRing, Loader2 } from "lucide-react";
import { ALERT_KIND_LIST, bellKinds } from "@/lib/alertPrefs";
import { useT } from "@/lib/i18n/I18nProvider";
import { useStore } from "@/lib/store";
import { useDemoMode } from "@/lib/useDemoMode";
import { useGradeAlertEmail } from "@/lib/useGradeAlertEmail";
import type { AlertKind } from "@/lib/types";
import { Switch, SwitchTrack } from "@/components/ui/Switch";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { DemoLocked } from "@/components/demo/NeedsAccount";

/**
 * Grade alerts: one table of the four kinds, a bell switch (a synced preference, on by default) and an
 * email switch (account-owned, off until "Send emails" is on) each. On phones every kind is a row with
 * both switches under its description.
 */
export function GradeAlertSettings() {
  const t = useT();
  const s = t.gradeAlerts.settings;
  const demo = useDemoMode();
  const courses = useStore((st) => st.courses);
  const rules = useStore((st) => st.requirementRules);
  const prefs = useStore((st) => st.alertPrefs);
  const setBell = useStore((st) => st.setBellAlertKinds);
  const mail = useGradeAlertEmail();
  const bell = bellKinds(prefs);

  const hasRules = rules.some((r) => courses.some((c) => c.id === r.courseId));
  if (!hasRules) {
    const first = courses[0];
    return (
      <section id="jegyriaszto" className="flex flex-col gap-6">
        <SectionHeading title={s.title} sub={s.sub} />
        <EmptyState
          icon={BellRing}
          title={s.emptyTitle}
          text={s.emptyText}
          action={
            <Link href={first ? `/targy/${first.id}#course-requirements` : "/"} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              {first ? s.emptyLink : s.emptyLinkNone}
            </Link>
          }
        />
      </section>
    );
  }

  const emailOn = mail.status === "on";
  const emailKinds = mail.kinds;
  const showEmail = !demo;
  const columns = showEmail ? "sm:grid-cols-[minmax(0,1fr)_4rem_4rem]" : "sm:grid-cols-[minmax(0,1fr)_4rem]";

  function setEmailKind(kind: AlertKind, on: boolean) {
    if (emailKinds) mail.setKinds({ ...emailKinds, [kind]: on });
  }

  return (
    <section id="jegyriaszto" className="flex flex-col gap-6">
      <SectionHeading title={s.title} sub={s.sub} />
      <div className="sheet-paper flex flex-col px-5 py-2">
        {showEmail && (
          <div className="border-b border-border">
            <Switch
              checked={emailOn}
              onChange={(on) => (on ? mail.enable() : mail.disable())}
              disabled={!mail.canEnable || mail.status === "loading"}
              label={
                <span className="inline-flex items-center gap-2">
                  {s.sendEmail}
                  {mail.status === "loading" && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
                </span>
              }
              description={
                <>
                  {s.sendEmailHint}
                  {mail.email && <span className="mt-0.5 block break-all">{s.sendTo(mail.email)}</span>}
                  {mail.status === "unavailable" && <span className="mt-0.5 block">{s.emailUnavailable}</span>}
                  {mail.status === "error" && <span className="mt-0.5 block font-semibold text-danger">{s.emailError}</span>}
                </>
              }
            />
          </div>
        )}
        <div role="table" aria-label={s.title} className="flex flex-col">
          <div role="row" className={`hidden gap-x-4 border-b border-border py-2 text-small font-semibold text-muted sm:grid ${columns}`}>
            <span role="columnheader">{s.kind}</span>
            <span role="columnheader" className="text-center">{s.bell}</span>
            {showEmail && <span role="columnheader" className="text-center">{s.email}</span>}
          </div>
          {ALERT_KIND_LIST.map((kind) => {
            const name = t.gradeAlerts.kinds[kind].name;
            return (
              <div
                key={kind}
                role="row"
                className={`grid gap-x-4 gap-y-2 border-b border-border py-3 last:border-b-0 sm:items-center ${columns}`}
              >
                <div role="cell" className="min-w-0">
                  <p className="text-body font-medium text-heading">{name}</p>
                  <p className="mt-0.5 text-small text-muted">{t.gradeAlerts.kinds[kind].description}</p>
                </div>
                <label role="cell" className="flex items-center justify-between gap-3 sm:justify-center">
                  <span className="text-small text-muted sm:hidden">{s.bell}</span>
                  <SwitchTrack
                    checked={bell[kind]}
                    onChange={(on) => setBell({ ...bell, [kind]: on })}
                    aria-label={s.switchLabel(name, s.bell)}
                  />
                </label>
                {showEmail && (
                  <label role="cell" className="flex items-center justify-between gap-3 sm:justify-center">
                    <span className="text-small text-muted sm:hidden">{s.email}</span>
                    <SwitchTrack
                      checked={emailOn && emailKinds?.[kind] === true}
                      onChange={(on) => setEmailKind(kind, on)}
                      disabled={!emailOn}
                      aria-label={s.switchLabel(name, s.email)}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {demo && <DemoLocked title={s.email} text={t.demo.locked.gradeAlerts.text} />}
    </section>
  );
}
