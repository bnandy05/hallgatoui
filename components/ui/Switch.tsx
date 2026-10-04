import { useId, type ReactNode } from "react";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

/** A labelled on/off switch: a toner track when on, a paper-edge outline when off. */
export function Switch({ checked, onChange, label, description, disabled = false }: SwitchProps) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-[14.5px] font-medium text-heading">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors duration-150 disabled:opacity-50 ${
          checked ? "border-accent bg-accent" : "border-border-strong bg-inset"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute h-[18px] w-[18px] rounded-full bg-card shadow-[var(--shadow-knob)] transition-transform duration-200 ease-[var(--ease-out-expo)] ${
            checked ? "translate-x-[18px]" : "translate-x-[2px]"
          }`}
        />
      </button>
    </div>
  );
}
