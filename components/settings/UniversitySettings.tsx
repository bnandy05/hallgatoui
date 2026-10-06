"use client";

import { useEffect, useState, type FormEvent } from "react";
import { UNIVERSITIES, universityName } from "@/lib/rules/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Select } from "@/components/ui/Select";

// The account's university, which scopes the shared requirement templates.

const OTHER = "egyeb";

export function UniversitySettings() {
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [choice, setChoice] = useState("");
  const [other, setOther] = useState("");
  const [status, setStatus] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/fiok/egyetem")
      .then((r) => (r.ok ? r.json() : { university: null }))
      .then((d: { university: string | null }) => {
        if (cancelled) return;
        setSaved(d.university);
        if (!d.university) return;
        if (UNIVERSITIES.some((u) => u.id === d.university)) setChoice(d.university);
        else {
          setChoice(OTHER);
          setOther(universityName(d.university));
        }
      })
      .catch(() => !cancelled && setSaved(null));
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const university = choice === "" ? null : choice === OTHER ? other : choice;
    const res = await fetch("/api/fiok/egyetem", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ university }),
    }).catch(() => null);
    if (!res?.ok) {
      setStatus({ tone: "bad", text: "Nem sikerült menteni." });
      return;
    }
    const d = (await res.json()) as { university: string | null };
    setSaved(d.university);
    setStatus({ tone: "ok", text: "Elmentve." });
  }

  return (
    <section id="egyetem" className="flex flex-col gap-4">
      <SectionHeading
        title="Egyetem"
        sub="A követelmény-sablonokat az azonos egyetemen, azonos tárgykóddal tanuló hallgatók megosztják egymással."
      />
      <Card>
        <form onSubmit={save} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="university">Egyetem</Label>
            <Select
              id="university"
              value={choice}
              disabled={saved === undefined}
              onChange={(e) => {
                setChoice(e.target.value);
                setStatus(null);
              }}
            >
              <option value="">Nincs megadva</option>
              {UNIVERSITIES.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
              <option value={OTHER}>Egyéb…</option>
            </Select>
          </div>
          {choice === OTHER && (
            <div>
              <Label htmlFor="university-other">Az egyetem neve</Label>
              <Input id="university-other" value={other} onChange={(e) => setOther(e.target.value)} maxLength={60} />
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={saved === undefined || (choice === OTHER && other.trim().length < 2)}>
              Mentés
            </Button>
            {status && (
              <p role={status.tone === "bad" ? "alert" : "status"} className={`text-[14px] ${status.tone === "bad" ? "text-danger" : "text-muted"}`}>
                {status.text}
              </p>
            )}
          </div>
        </form>
      </Card>
    </section>
  );
}
