import type { ReactNode } from "react";

export interface SectionHeadingProps {
  title: ReactNode;
  as?: "h1" | "h2";
  sub?: ReactNode;
  actions?: ReactNode;
  className?: string;
  id?: string;
}

/** A page or section heading: printed-notice title, one optional line under it, actions on the right. */
export function SectionHeading({ title, as = "h2", sub, actions, className = "", id }: SectionHeadingProps) {
  const Heading = as;
  const size = as === "h1" ? "text-[clamp(34px,5.2vw,52px)]" : "text-[clamp(24px,3vw,30px)]";
  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-4 ${className}`}>
      <div className="min-w-0">
        <Heading id={id} className={`font-display break-words text-heading [text-wrap:balance] ${size}`}>
          {title}
        </Heading>
        {sub && <p className="mt-2 max-w-[62ch] text-[15px] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
