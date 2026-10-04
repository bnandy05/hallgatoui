"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { DialogActions } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { COURSE_COLORS } from "@/lib/colors";
import type { Course } from "@/lib/types";

export interface CourseFormValues {
  name: string;
  code?: string;
  semester?: string;
  color: string;
  matchKeywords: string[];
}

export interface CourseFormProps {
  initial?: Course;
  defaultColor: string;
  onSubmit: (values: CourseFormValues) => void;
  onCancel: () => void;
}

export function CourseForm({ initial, defaultColor, onSubmit, onCancel }: CourseFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [semester, setSemester] = useState(initial?.semester ?? "");
  const [color, setColor] = useState(initial?.color ?? defaultColor);
  const [matchKeywords, setMatchKeywords] = useState(
    (initial?.matchKeywords ?? []).join(", ")
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const keywords = matchKeywords
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    onSubmit({
      name: trimmedName,
      code: code.trim() || undefined,
      semester: semester.trim() || undefined,
      color,
      matchKeywords: keywords,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="course-name">Név</Label>
        <Input
          id="course-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="course-code">Kód</Label>
          <Input
            id="course-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="course-semester">Félév</Label>
          <Input
            id="course-semester"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            placeholder="2026/27/1"
          />
        </div>
      </div>

      <div>
        <Label>Szín</Label>
        <div className="flex flex-wrap gap-2">
          {COURSE_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`Szín kiválasztása: ${swatch}`}
              onClick={() => setColor(swatch)}
              className={`h-7 w-7 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                color === swatch ? "ring-2 ring-offset-2 ring-foreground" : ""
              }`}
              style={{ backgroundColor: swatch }}
            />
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="course-keywords">Kulcsszavak</Label>
        <Input
          id="course-keywords"
          value={matchKeywords}
          onChange={(e) => setMatchKeywords(e.target.value)}
          placeholder="pl. progeg, ip-18progeg"
        />
        <p className="mt-1 text-xs text-muted">
          iCal eseményekhez: ha a cím tartalmazza, ide kerül. A Canvas kurzuskódok automatikusan kitöltődnek, ha a tárgyat a naptárból veszed fel.
        </p>
      </div>

      <DialogActions>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Mégse
        </Button>
        <Button type="submit">Mentés</Button>
      </DialogActions>
    </form>
  );
}
