"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import type { SubjectRules } from "@/lib/rules/types";
import { validateRules } from "@/lib/rules/validate";
import { Button } from "@/components/ui/Button";
import { DialogActions } from "@/components/ui/Dialog";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";

export function RulesJsonForm({
  initial,
  note,
  back,
  onDirty,
  onSubmit,
  onCancel,
}: {
  initial: string;
  note?: string;
  /** Opened from the reading: the secondary button goes back to it. */
  back: boolean;
  onDirty: (dirty: boolean) => void;
  onSubmit: (rules: SubjectRules) => void;
  onCancel: () => void;
}) {
  const tAll = useT();
  const t = tAll.rulesPanel;
  const locale = useLocale();
  const [value, setValue] = useState(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const dirty = value !== initial;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      setErrors([t.jsonInvalid]);
      return;
    }
    const result = validateRules(parsed, locale);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSubmit(result.rules);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {note && <p className="text-body text-muted">{note}</p>}
      <div>
        <Label htmlFor="rules-json">{t.jsonLabel}</Label>
        <Textarea
          id="rules-json"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={18}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-mono text-fine! leading-relaxed max-sm:min-h-[45dvh]"
          placeholder='{ "schemaVersion": 1, "components": [], "retakes": [], "derived": [], "tables": [], "outcomes": [], "flags": [] }'
        />
        {errors.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-small text-danger" role="alert">
            {errors.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {errors.length > 8 && <li>{t.jsonMoreErrors(errors.length - 8)}</li>}
          </ul>
        )}
      </div>
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {back && <ArrowLeft className="h-4 w-4" aria-hidden />}
          {back ? t.back : tAll.common.cancel}
        </Button>
        <Button type="submit">{tAll.common.save}</Button>
      </DialogActions>
    </form>
  );
}

