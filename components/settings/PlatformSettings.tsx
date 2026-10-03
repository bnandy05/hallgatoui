"use client";

import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { BUILT_IN_PLATFORMS } from "@/lib/platforms";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { PlatformIcon } from "@/components/PlatformIcon";

const DEFAULT_CUSTOM_COLOR = "#8b5cf6";

export function PlatformSettings() {
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
    if (
      confirm(
        'Biztosan törlöd? Az ezt használó linkek „Egyéb” platformra kerülnek.'
      )
    ) {
      removeCustomPlatform(id);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <SectionHeading
        eyebrow="Platformok"
        title="Platformok"
        sub="Ha a karodnak saját rendszere van (pl. TMS), add hozzá itt."
      />

      <div>
        <Label>Beépített platformok</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {BUILT_IN_PLATFORMS.map((platform) => (
            <div
              key={platform.id}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
            >
              <PlatformIcon platform={platform} size="sm" />
              <span className="text-sm text-foreground">{platform.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label>Saját platformok</Label>
        {customPlatforms.length > 0 && (
          <ul className="flex flex-col gap-2">
            {customPlatforms.map((platform) => (
              <li
                key={platform.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                <PlatformIcon platform={platform} size="sm" />
                <Input
                  value={platform.name}
                  onChange={(e) =>
                    updateCustomPlatform(platform.id, { name: e.target.value })
                  }
                  className="max-w-xs"
                  aria-label="Platform neve"
                />
                <input
                  type="color"
                  value={platform.color}
                  onChange={(e) =>
                    updateCustomPlatform(platform.id, { color: e.target.value })
                  }
                  aria-label="Platform színe"
                  className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-card p-1"
                />
                <button
                  type="button"
                  aria-label="Törlés"
                  onClick={() => handleRemove(platform.id)}
                  className="shrink-0 rounded-md p-1.5 text-muted hover:bg-inset focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAdd} className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Új platform neve"
            className="max-w-xs"
            aria-label="Új platform neve"
          />
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            aria-label="Új platform színe"
            className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-card p-1"
          />
          <Button type="submit" size="sm" disabled={newName.trim().length === 0}>
            Hozzáadás
          </Button>
        </form>
      </div>
    </section>
  );
}
