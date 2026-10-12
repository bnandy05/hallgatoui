import type { ComponentProps, ReactNode } from "react";
import { Check } from "lucide-react";

export interface CheckboxProps extends Omit<ComponentProps<"input">, "type" | "children"> {
  /** Text next to the box. Without it the box stands alone and needs an `aria-label`. */
  label?: ReactNode;
  description?: ReactNode;
}

/** A drawn tick box: paper with a toner edge, filled with toner and a tick when checked. The native input sits on top, so keyboard, forms and screen readers behave as usual. */
export function Checkbox({ label, description, className = "", ...props }: CheckboxProps) {
  const box = (
    <span className="relative mt-px inline-flex h-[18px] w-[18px] shrink-0">
      <input
        type="checkbox"
        className="peer absolute -left-2 -top-2 z-10 m-0 h-[calc(100%+16px)] w-[calc(100%+16px)] cursor-pointer appearance-none opacity-0 disabled:cursor-default"
        {...props}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none flex h-full w-full items-center justify-center rounded-[var(--radius-slip)] border border-border-strong bg-card text-accent-ink shadow-[var(--shadow-inset)] transition-colors duration-150 peer-checked:border-accent peer-checked:bg-accent peer-hover:border-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:opacity-50 [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100"
      >
        <Check className="h-3 w-3 transition-opacity duration-100" strokeWidth={3} />
      </span>
    </span>
  );
  if (!label) return <span className={`inline-flex ${className}`}>{box}</span>;
  return (
    <label className={`flex cursor-pointer items-start gap-2.5 text-body text-foreground ${className}`}>
      {box}
      <span className="min-w-0">
        {label}
        {description && <span className="block text-fine text-muted">{description}</span>}
      </span>
    </label>
  );
}
