import type { SelectHTMLAttributes } from "react";
import { fieldClasses } from "@/components/ui/Input";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className = "", ...props }: SelectProps) {
  return <select className={`${fieldClasses} ${className}`} {...props} />;
}
