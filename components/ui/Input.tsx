import type { ComponentProps } from "react";

export type InputProps = ComponentProps<"input">;

export const fieldClasses =
  "w-full rounded-[var(--radius)] border border-border bg-card px-3 py-2 text-body text-foreground placeholder:text-muted-dim shadow-[var(--shadow-inset)] transition-colors duration-150 hover:border-border-strong focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent disabled:bg-inset disabled:text-muted";

export function Input({ className = "", ...props }: InputProps) {
  return <input className={`${fieldClasses} ${className}`} {...props} />;
}
