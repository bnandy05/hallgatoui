import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CONTROLLER, SOURCE_URL } from "@/lib/legal";
import { termsContent, type TermsParagraph, type TermsRow } from "@/lib/terms";
import { getLocale, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.meta.terms };
}

// Service-provider details (Eker. tv. 4. §) and terms of use. Public: the proxy lets it through
// without a session. The text is in lib/terms.ts (both languages).

function Section({ title, prominent, children }: { title: string; prominent?: boolean; children: ReactNode }) {
  return (
    <Card
      className={`flex flex-col gap-3 text-lead leading-relaxed text-foreground ${prominent ? "border-2 border-heading" : ""}`}
    >
      <h2 className="font-display text-subhead text-heading">{title}</h2>
      {children}
    </Card>
  );
}

function Rows({ rows }: { rows: TermsRow[] }) {
  return (
    <dl className="flex flex-col gap-1">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-wrap gap-x-2">
          <dt className="font-semibold text-heading">{r.label}:</dt>
          <dd>
            {r.kind === "mail" ? (
              <a href={`mailto:${r.value}`} className="link-text">
                {r.value}
              </a>
            ) : r.kind === "url" ? (
              <a href={r.value} className="link-text" rel="noopener noreferrer">
                {r.value}
              </a>
            ) : (
              r.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Paragraph({ p }: { p: TermsParagraph }) {
  if (typeof p === "string") return <p>{p}</p>;
  const { kind, text } = p.link;
  const link =
    kind === "privacy" ? (
      <Link href="/adatvedelem" className="link-text">
        {text}
      </Link>
    ) : kind === "source" ? (
      <a href={SOURCE_URL} className="link-text" rel="noopener noreferrer">
        {text}
      </a>
    ) : (
      <a href={`mailto:${CONTROLLER.email}`} className="link-text">
        {text}
      </a>
    );
  return (
    <p>
      {p.before}
      {link}
      {p.after}
    </p>
  );
}

export default async function TermsPage() {
  const locale = await getLocale();
  const c = termsContent(locale);

  return (
    <div className="flex max-w-[760px] flex-col gap-6" lang={locale}>
      <SectionHeading as="h1" title={c.title} sub={c.sub} />
      {c.translationNote && <p className="text-body font-semibold text-muted">{c.translationNote}</p>}

      <Section title={c.provider.title}>
        <Rows rows={c.provider.operator} />
        <p>{c.provider.note}</p>
        <h3 className="font-semibold text-heading">{c.provider.hostingTitle}</h3>
        <Rows rows={c.provider.hosting} />
      </Section>

      {c.sections.map((s) => (
        <Section key={s.title} title={s.title} prominent={s.prominent}>
          {s.paragraphs.map((p, i) => (
            <Paragraph key={i} p={p} />
          ))}
        </Section>
      ))}
    </div>
  );
}
