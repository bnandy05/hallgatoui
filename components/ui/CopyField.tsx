"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/Input";

export interface CopyFieldProps {
  value: string;
  label: string;
}

/** A read-only link with one big copy button; tapping the field selects the whole link. */
export function CopyField({ value, label }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable (insecure context or denied): the field can still be selected by hand.
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        readOnly
        value={value}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        className={`${fieldClasses} min-w-0 flex-1 truncate bg-inset text-[13.5px] text-muted`}
      />
      <button
        type="button"
        onClick={copy}
        className={buttonClasses({
          variant: copied ? "secondary" : "primary",
          className: copied ? "!border-success text-success" : "",
        })}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Másolva" : "Link másolása"}
      </button>
    </div>
  );
}
