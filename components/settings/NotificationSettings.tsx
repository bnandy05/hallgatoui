"use client";

import { useStore } from "@/lib/store";
import { LEAD_OPTIONS } from "@/lib/notifications";
import {
  refreshNotificationPermission,
  useNotificationPermission,
} from "@/lib/useNotificationPermission";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { SectionHeading } from "@/components/ui/SectionHeading";

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
    <section id="ertesitesek" className="flex flex-col gap-4">
      <SectionHeading title="Értesítések" sub="A böngésző szól, mielőtt egy határidő lejár." />

      <Card className="flex flex-col gap-4">
        {permission === "unsupported" ? (
          <p className="text-[14px] text-muted">Ez a böngésző nem támogatja az értesítéseket.</p>
        ) : permission === "denied" ? (
          <p className="text-[14px] text-muted">
            Az értesítések le vannak tiltva a böngészőben. A címsor melletti lakat ikonnál engedélyezheted őket.
          </p>
        ) : !active ? (
          <div>
            <Button type="button" onClick={enable}>
              Értesítések bekapcsolása
            </Button>
          </div>
        ) : (
          <>
            <div>
              <p className="mb-2 text-[13px] font-semibold text-heading">Mikor szóljon?</p>
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

            <label className="flex items-center gap-2 text-[14px] text-foreground">
              <input
                type="checkbox"
                checked={prefs.criticalOnly}
                onChange={(e) => setNotificationPrefs({ criticalOnly: e.target.checked })}
                className="h-4 w-4 accent-accent"
              />
              Csak a kritikus határidőknél
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setNotificationPrefs({ enabled: false })}
              >
                Kikapcsolás
              </Button>
              <Button type="button" variant="ghost" onClick={sendTest}>
                Próbaértesítés
              </Button>
            </div>
          </>
        )}

        <p className="text-[13px] text-muted">Értesítés csak akkor érkezik, ha az oldal nyitva van egy böngészőlapon.</p>
      </Card>
    </section>
  );
}
