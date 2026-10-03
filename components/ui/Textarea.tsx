import type { TextareaHTMLAttributes } from "react";
import { fieldClasses } from "@/components/ui/Input";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className = "", ...props }: TextareaProps) {
  return <textarea className={`${fieldClasses} ${className}`} {...props} />;
}
