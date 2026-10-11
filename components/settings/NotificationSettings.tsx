"use client";

import { BellRing } from "lucide-react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n/I18nProvider";
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
  const t = useT();
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
      new Notification(t.shell.brand, {
        body: t.notifications.testBody,
        icon: "/favicon.ico",
      });
    } catch {
      // Some mobile browsers throw on the constructor.
    }
  }

  const active = prefs.enabled && permission === "granted";

  return (
    <section id="ertesitesek" className="flex flex-col gap-6">
      <SectionHeading title={t.notifications.title} sub={t.notifications.sub} />

      <div className="sheet-paper flex flex-col px-5 py-1">
        {permission === "unsupported" ? (
          <p className="py-4 text-body text-muted">{t.notifications.unsupported}</p>
        ) : permission === "denied" ? (
          <p className="py-4 text-body text-muted">
            {t.notifications.denied}
          </p>
        ) : (
          <Switch
            checked={active}
            onChange={(on) => (on ? void enable() : setNotificationPrefs({ enabled: false }))}
            label={t.notifications.browser}
            description={t.notifications.browserHint}
          />
        )}

        {active && (
          <>
            <div className="border-t border-border/70 py-4">
              <p className="mb-2.5 text-body font-medium text-heading">{t.notifications.timing}</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t.notifications.leadGroup}>
                {LEAD_OPTIONS.map((opt) => (
                  <Pill
                    key={opt.minutes}
                    active={prefs.leadMinutes.includes(opt.minutes)}
                    onClick={() => toggleLead(opt.minutes)}
                  >
                    {t.notifications.lead(opt.minutes)}
                  </Pill>
                ))}
              </div>
            </div>
            <div className="border-t border-border/70">
              <Switch
                checked={prefs.criticalOnly}
                onChange={(v) => setNotificationPrefs({ criticalOnly: v })}
                label={t.notifications.criticalOnly}
              />
            </div>
            <div className="border-t border-border/70 py-3">
              <Button type="button" variant="secondary" size="sm" onClick={sendTest}>
                <BellRing className="h-4 w-4" />
                {t.notifications.sendTest}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
