import type { ComponentProps } from "react";

export type InputProps = ComponentProps<"input">;

export const fieldClasses =
  "w-full rounded-[var(--radius)] border border-border bg-inset px-3 py-2 text-sm text-foreground placeholder:text-muted-dim transition-colors duration-150 hover:border-border-strong focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent";

export function Input({ className = "", ...props }: InputProps) {
  return <input className={`${fieldClasses} ${className}`} {...props} />;
}
