import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export interface ButtonClassesOptions {
  variant?: Variant;
  size?: Size;
  className?: string;
}

// Primary is toner black on paper; secondary is a paper slip; danger is the red pin's ink.
const variantClasses: Record<Variant, string> = {
  primary:
    "bg-accent border border-accent font-semibold text-accent-ink shadow-[0_1px_2px_rgba(20,24,28,0.25)] hover:bg-accent-hover active:translate-y-px",
  secondary:
    "bg-card border border-border text-foreground shadow-[0_1px_1px_rgba(30,40,48,0.06)] hover:border-border-strong hover:shadow-[var(--shadow-paper)] active:translate-y-px",
  ghost: "border border-transparent bg-transparent text-foreground hover:bg-black/[0.05]",
  danger:
    "bg-danger border border-danger font-semibold text-accent-ink hover:bg-danger-hover active:translate-y-px focus-visible:outline-danger",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 text-[13.5px] px-3 gap-1.5",
  md: "h-10 text-[14.5px] px-4 gap-2",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className = "",
}: ButtonClassesOptions = {}): string {
  return `inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--radius)] font-medium transition-[background-color,border-color,box-shadow,transform] duration-150 ease-[var(--ease-out)] disabled:pointer-events-none disabled:border-border disabled:bg-inset disabled:text-muted-dim disabled:shadow-none ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return <button className={buttonClasses({ variant, size, className })} {...props} />;
}
