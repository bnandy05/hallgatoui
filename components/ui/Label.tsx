import type { LabelHTMLAttributes } from "react";

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className = "", ...props }: LabelProps) {
  return (
    <label
      className={`mb-1.5 block text-[13px] font-semibold text-heading ${className}`}
      {...props}
    />
  );
}
