import { AlertTriangle } from "lucide-react";
import { describeRules } from "@/lib/rules/describe";
import type { SubjectRules } from "@/lib/rules/types";

// What a rule set will compute, in plain Hungarian, for every review screen (survey form, parser
// fallback, shared template): one ruled block per part, then the assumptions to check. Or, when
// the answers do not make rules yet, the reasons.

export function RulesPreview({ rules }: { rules: SubjectRules }) {
  const sections = describeRules(rules);
  return (
    <div className="flex flex-col">
      {sections.map((s) => (
        <div key={s.title} className="border-t border-border py-2.5 first:border-t-0 first:pt-0">
          <p className="text-[12.5px] font-semibold text-muted">{s.title}</p>
          <ul className="mt-1 flex flex-col gap-1 text-[13.5px] leading-snug text-foreground">
            {s.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ))}
      {rules.flags.length > 0 && (
        <div className="mt-1 rounded-[var(--radius-slip)] bg-canary px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-heading">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Mentés után ellenőrizd
          </p>
          <ul className="mt-1 flex flex-col gap-1 text-[13px] leading-snug text-heading">
            {rules.flags.map((f) => (
              <li key={`${f.field}:${f.message}`}>{f.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function RulesErrors({ title, errors, hint }: { title: string; errors: string[]; hint: string }) {
  return (
    <div role="alert">
      <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-danger">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        {title}
      </p>
      <ul className="mt-1.5 flex flex-col gap-1 text-[13px] leading-snug text-foreground">
        {errors.slice(0, 8).map((e) => (
          <li key={e}>{e}</li>
        ))}
        {errors.length > 8 && <li className="text-muted">…és még {errors.length - 8}.</li>}
      </ul>
      <p className="mt-2 text-[12.5px] text-muted">{hint}</p>
    </div>
  );
}
