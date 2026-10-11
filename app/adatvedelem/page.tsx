import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CONTROLLER } from "@/lib/legal";
import { privacyContent } from "@/lib/privacy";
import { getLocale, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.meta.privacy };
}

// The privacy notice (GDPR Art. 13). Public: the proxy lets it through without a session. The
// text is in lib/privacy.ts (both languages); every statement there must match what the code
// does, so change it together with the data it describes.

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 text-[15px] leading-relaxed text-foreground">
      <h2 className="font-display text-[22px] text-heading">{title}</h2>
      {children}
    </Card>
  );
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  const c = privacyContent(locale);
  const mail = (
    <a href={`mailto:${CONTROLLER.email}`} className="font-semibold text-heading underline underline-offset-2">
      {CONTROLLER.email}
    </a>
  );

  return (
    <div className="flex max-w-[760px] flex-col gap-6" lang={locale}>
      <SectionHeading as="h1" title={c.title} sub={c.sub} />
      {c.translationNote && <p className="text-[14px] font-semibold text-muted">{c.translationNote}</p>}

      <Section title={c.controller.title}>
        <p>
          {c.controller.beforeMail}
          {mail}
          {c.controller.afterMail}
        </p>
        <p>{c.controller.independent}</p>
      </Section>

      <Section title={c.purposes.title}>
        <dl className="flex flex-col divide-y divide-border">
          {c.purposes.items.map((p) => (
            <div key={p.what} className="flex flex-col gap-1.5 py-4 first:pt-0 last:pb-0">
              <dt className="font-semibold text-heading">{p.what}</dt>
              <dd>{p.data}</dd>
              <dd className="text-muted">
                <span className="font-semibold">{c.purposes.basisLabel}</span> {p.basis}
              </dd>
              <dd className="text-muted">
                <span className="font-semibold">{c.purposes.keepLabel}</span> {p.until}
              </dd>
            </div>
          ))}
        </dl>
        <p>{c.purposes.closing}</p>
      </Section>

      <Section title={c.cookies.title}>
        <p>{c.cookies.text}</p>
      </Section>

      <Section title={c.processors.title}>
        <ul className="flex flex-col gap-3">
          {c.processors.items.map((p) => (
            <li key={p.name}>
              <span className="font-semibold text-heading">{p.name}</span>: {p.role} {p.where}
            </li>
          ))}
        </ul>
        <p>{c.processors.transfers}</p>
        <p>{c.processors.feeds}</p>
      </Section>

      <Section title={c.rights.title}>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          {c.rights.items.map((r) => (
            <li key={r.label}>
              <span className="font-semibold">{r.label}</span>
              {r.text}
            </li>
          ))}
        </ul>
        <p>{c.rights.complaint}</p>
      </Section>

      <Section title={c.security.title}>
        <p>{c.security.text}</p>
      </Section>

      <Section title={c.changes.title}>
        <p>{c.changes.text}</p>
      </Section>
    </div>
  );
}
