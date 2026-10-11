"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n/I18nProvider";
import { BUILT_IN_PLATFORMS, platformName } from "@/lib/platforms";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Input } from "@/components/ui/Input";
import { PlatformIcon } from "@/components/PlatformIcon";

const DEFAULT_CUSTOM_COLOR = "#8b5cf6";

export function PlatformSettings() {
  const t = useT();
  const customPlatforms = useStore((s) => s.customPlatforms);
  const addCustomPlatform = useStore((s) => s.addCustomPlatform);
  const updateCustomPlatform = useStore((s) => s.updateCustomPlatform);
  const removeCustomPlatform = useStore((s) => s.removeCustomPlatform);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_CUSTOM_COLOR);

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    addCustomPlatform(trimmed, newColor);
    setNewName("");
    setNewColor(DEFAULT_CUSTOM_COLOR);
  }

  function handleRemove(id: string) {
    if (confirm(t.platformSettings.confirmDelete)) {
      removeCustomPlatform(id);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <SectionHeading
        title={t.platformSettings.title}
        sub={t.platformSettings.sub}
      />

      <div className="flex flex-col gap-3">
        <h3 className="font-display text-[22px] text-heading">{t.platformSettings.custom}</h3>
        <div className="sheet-paper divide-y divide-border/70 px-5">
          {customPlatforms.map((platform) => (
            <div key={platform.id} className="flex items-center gap-2 py-3">
              <PlatformIcon platform={platform} size="md" />
              <Input
                value={platform.name}
                onChange={(e) => updateCustomPlatform(platform.id, { name: e.target.value })}
                className="min-w-0 flex-1"
                aria-label={t.platformSettings.nameAria}
              />
              <input
                type="color"
                value={platform.color}
                onChange={(e) => updateCustomPlatform(platform.id, { color: e.target.value })}
                aria-label={t.platformSettings.colorAria}
                className="h-10 w-10 shrink-0 cursor-pointer rounded-[var(--radius)] border border-border bg-card p-1"
              />
              <button
                type="button"
                aria-label={t.feeds.deleteAria(platform.name)}
                title={t.common.delete}
                onClick={() => handleRemove(platform.id)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted hover:bg-danger/10 hover:text-danger focus-visible:outline-2 focus-visible:outline-accent"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <form onSubmit={handleAdd} className="flex items-center gap-2 py-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t.platformSettings.newName}
              className="min-w-0 flex-1"
              aria-label={t.platformSettings.newName}
            />
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              aria-label={t.platformSettings.newColor}
              className="h-10 w-10 shrink-0 cursor-pointer rounded-[var(--radius)] border border-border bg-card p-1"
            />
            <Button type="submit" size="sm" disabled={newName.trim().length === 0} className="max-sm:!h-10">
              <Plus className="h-4 w-4" />
              {t.platformSettings.add}
            </Button>
          </form>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-display text-[22px] text-heading">{t.platformSettings.builtIn}</h3>
        <ul className="flex flex-wrap gap-2">
          {BUILT_IN_PLATFORMS.map((platform) => (
            <li
              key={platform.id}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-[13.5px] text-foreground"
            >
              <PlatformIcon platform={platform} size="sm" />
              {platformName(platform, t.platforms.other)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
