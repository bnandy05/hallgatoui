import type { ComponentProps } from "react";

export type InputProps = ComponentProps<"input">;

export function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent ${className}`}
      {...props}
    />
  );
}
