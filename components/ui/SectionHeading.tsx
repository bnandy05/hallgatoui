import type { ComponentType, ReactNode } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";

export interface SectionHeadingProps {
  eyebrow: string;
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  as?: "h1" | "h2";
  sub?: ReactNode;
  aside?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function SectionHeading({
  eyebrow,
  icon,
  title,
  as = "h2",
  sub,
  aside,
  actions,
  className = "",
}: SectionHeadingProps) {
  const Heading = as;
  const size =
    as === "h1" ? "text-[clamp(26px,4vw,36px)]" : "text-[clamp(19px,2.7vw,26px)]";
  return (
    <div
      className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className}`}
    >
      <div className="min-w-0">
        <Eyebrow icon={icon}>{eyebrow}</Eyebrow>
        <Heading
          className={`mt-2 break-words font-bold leading-[1.12] tracking-[-0.01em] text-heading ${size}`}
          style={as === "h1" ? { textShadow: "0 2px 20px rgba(0,0,0,.45)" } : undefined}
        >
          {title}
        </Heading>
        {sub && <p className="mt-3 max-w-[620px] text-muted">{sub}</p>}
        {aside && <p className="mt-2 text-[11.5px] text-muted-dim opacity-90">{aside}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
