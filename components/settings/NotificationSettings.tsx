"use client";

import { BellRing } from "lucide-react";
import { useStore } from "@/lib/store";
import { LEAD_OPTIONS } from "@/lib/notifications";
import {
  refreshNotificationPermission,
  useNotificationPermission,
} from "@/lib/useNotificationPermission";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Switch } from "@/components/ui/Switch";

export function NotificationSettings() {
  const prefs = useStore((s) => s.notificationPrefs);
  const setNotificationPrefs = useStore((s) => s.setNotificationPrefs);
  const permission = useNotificationPermission();

  async function enable() {
    try {
      const result = await Notification.requestPermission();
      if (result === "granted") setNotificationPrefs({ enabled: true });
    } catch {
      // Unsupported or blocked request: the permission state below tells the story.
    }
    refreshNotificationPermission();
  }

  function toggleLead(minutes: number) {
    const has = prefs.leadMinutes.includes(minutes);
    if (has && prefs.leadMinutes.length === 1) return; // at least one must stay selected
    const next = has
      ? prefs.leadMinutes.filter((m) => m !== minutes)
      : [...prefs.leadMinutes, minutes];
    setNotificationPrefs({ leadMinutes: next.sort((a, b) => b - a) });
  }

  function sendTest() {
    try {
      new Notification("Hallgatói réteg", {
        body: "Így fog kinézni egy emlékeztető.",
        icon: "/favicon.ico",
      });
    } catch {
      // Some mobile browsers throw on the constructor.
    }
  }

  const active = prefs.enabled && permission === "granted";

  return (
    <section id="ertesitesek" className="flex flex-col gap-6">
      <SectionHeading title="Értesítések" sub="Böngészőértesítés a határidők lejárta előtt." />

      <div className="sheet-paper flex flex-col px-5 py-1">
        {permission === "unsupported" ? (
          <p className="py-4 text-[14px] text-muted">Ez a böngésző nem támogatja az értesítéseket.</p>
        ) : permission === "denied" ? (
          <p className="py-4 text-[14px] text-muted">
            Az értesítések le vannak tiltva a böngészőben. A címsor melletti lakat ikonnál engedélyezheted őket.
          </p>
        ) : (
          <Switch
            checked={active}
            onChange={(on) => (on ? void enable() : setNotificationPrefs({ enabled: false }))}
            label="Böngészőértesítések"
            description="Csak akkor érkezik értesítés, ha az oldal nyitva van egy böngészőlapon."
          />
        )}

        {active && (
          <>
            <div className="border-t border-border/70 py-4">
              <p className="mb-2.5 text-[14.5px] font-medium text-heading">Időzítés</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Emlékeztető időpontok">
                {LEAD_OPTIONS.map((opt) => (
                  <Pill
                    key={opt.minutes}
                    active={prefs.leadMinutes.includes(opt.minutes)}
                    onClick={() => toggleLead(opt.minutes)}
                  >
                    {opt.label}
                  </Pill>
                ))}
              </div>
            </div>
            <div className="border-t border-border/70">
              <Switch
                checked={prefs.criticalOnly}
                onChange={(v) => setNotificationPrefs({ criticalOnly: v })}
                label="Csak a kritikus határidőknél"
              />
            </div>
            <div className="border-t border-border/70 py-3">
              <Button type="button" variant="secondary" size="sm" onClick={sendTest}>
                <BellRing className="h-4 w-4" />
                Próbaértesítés küldése
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
