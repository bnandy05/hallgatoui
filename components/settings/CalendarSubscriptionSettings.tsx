"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { hu } from "date-fns/locale";
import { CalendarCheck, CalendarPlus, Download, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { parseView, viewParam } from "@/lib/ical/views";
import {
  createSubscription,
  deleteSubscription,
  downloadCalendar,
  rotateSubscription,
  subscriptionPath,
} from "@/lib/subscription/client";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { SectionHeading } from "@/components/ui/SectionHeading";

type Busy = "create" | "rotate" | "delete" | null;

export function CalendarSubscriptionSettings() {
  const subscription = useStore((s) => s.subscription);
  const courses = useStore((s) => s.courses);
  const exportOptions = useStore((s) => s.exportOptions);
  const setExportOptions = useStore((s) => s.setExportOptions);

  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewValue, setViewValue] = useState("osszes");

  async function run(kind: Exclude<Busy, null>, action: () => Promise<string | null>) {
    setBusy(kind);
    setError(null);
    const message = await action();
    setError(message);
    setBusy(null);
  }

  function handleRotate() {
    if (
      !confirm(
        "Új linket kapsz, a régi előfizetések (Apple, Google Naptár) nem frissülnek tovább, és újra fel kell iratkoznod. Folytatod?"
      )
    ) {
      return;
    }
    void run("rotate", rotateSubscription);
  }

  function handleDisable() {
    if (!confirm("Kikapcsolod? A szerveren tárolt adataid törlődnek, a naptár-link megszűnik.")) {
      return;
    }
    void run("delete", deleteSubscription);
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  // A deleted course falls back to the full calendar, like the server does.
  const view = parseView(viewValue, courses);
  const query = view.kind === "all" ? "" : `?nezet=${encodeURIComponent(viewParam(view))}`;
  const path = subscription ? `${subscriptionPath(subscription.token)}${query}` : "";
  const httpsUrl = `${origin}${path}`;
  const webcalUrl = `webcal://${origin.replace(/^https?:\/\//, "")}${path}`;
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
  const spinner = <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <section id="naptar-elofizetes" className="flex flex-col gap-4">
      <SectionHeading
        eyebrow="Naptár-előfizetés"
        icon={CalendarCheck}
        title="Egy összefésült naptár"
        sub="Az összes tárgyad, határidőd és forrásnaptárad egyetlen, letisztított naptárban, amire az Apple és a Google Naptárban is előfizethetsz."
      />

      <Card className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-sm text-muted">
            Egyszeri pillanatkép az összes határidőddel, amit a böngésződben állítunk elő. Nem frissül magától, és nem
            kell hozzá bekapcsolni az előfizetést.
          </p>
          <Button type="button" variant="secondary" onClick={downloadCalendar}>
            <Download className="h-4 w-4" />
            Letöltés (.ics)
          </Button>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4 text-sm text-foreground">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={exportOptions.includeDone}
              onChange={(e) => setExportOptions({ includeDone: e.target.checked })}
              className="h-4 w-4 accent-accent"
            />
            Kész feladatok megjelenítése
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={exportOptions.alarms}
              onChange={(e) => setExportOptions({ alarms: e.target.checked })}
              className="h-4 w-4 accent-accent"
            />
            Emlékeztetők a kritikus határidőkhöz
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={exportOptions.weeklySummary}
              onChange={(e) => setExportOptions({ weeklySummary: e.target.checked })}
              className="h-4 w-4 accent-accent"
            />
            Heti összefoglaló hétfőnként
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={exportOptions.studyBlocks}
              onChange={(e) => setExportOptions({ studyBlocks: e.target.checked })}
              className="h-4 w-4 accent-accent"
            />
            Készülési sáv kritikus határidők előtt (2 nap)
          </label>
        </div>

        {!subscription ? (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex gap-2 rounded-md border border-border bg-inset p-3 text-[12.5px] text-muted">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden="true" />
              <p>
                A bekapcsoláskor a tárgyaid, a határidőid és a forrásnaptáraid címe feltöltődik a
                szerverre. Ezek a címek tartalmazhatnak privát Canvas- vagy Moodle-tokent is. A
                szerver a forrásnaptárakat magától is frissíti, így a naptárad az oldal
                megnyitása nélkül is naprakész marad. Bármikor kikapcsolhatod, és ilyenkor
                minden adatod törlődik a szerverről.
              </p>
            </div>
            <div>
              <Button
                type="button"
                disabled={busy !== null}
                onClick={() => void run("create", createSubscription)}
              >
                {busy === "create" ? spinner : <CalendarPlus className="h-4 w-4" />}
                Előfizetés bekapcsolása
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div>
              <Label htmlFor="naptar-nezet">Nézet</Label>
              <Select
                id="naptar-nezet"
                value={view.kind === "all" ? "osszes" : viewValue}
                onChange={(e) => setViewValue(e.target.value)}
              >
                <option value="osszes">Mindent</option>
                <option value="kritikus">Csak kritikus</option>
                <option value="zh">ZH-k és vizsgák</option>
                {courses.map((c) => (
                  <option key={c.id} value={`targy-${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-[12.5px] text-muted">
                Minden nézetre külön is feliratkozhatsz, például tárgyanként más színnel.
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Előfizetési link</p>
              <CodeBlock prompt={false}>{httpsUrl}</CodeBlock>
              <p className="mt-2 text-[12.5px] text-muted">
                Aki ismeri a linket, látja a naptárat. Ne oszd meg.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <a href={webcalUrl} className={buttonClasses({ variant: "secondary" })}>
                Apple Naptár
              </a>
              <a
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses({ variant: "secondary" })}
              >
                Google Naptár
              </a>
            </div>

            <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-muted">
              <li>
                A Google Naptár a saját ütemében frissít (általában 8–24 óránként), ezt nem lehet
                siettetni. Az előfizetett naptárak emlékeztetőit is figyelmen kívül hagyja.
              </li>
              <li>
                Az Apple Naptárban a naptár beállításainál megadhatod a frissítés gyakoriságát
                (például 5 vagy 15 percenként).
              </li>
            </ul>

            <p className="text-xs">
              {subscription.lastError ? (
                <span className="text-danger">{subscription.lastError}</span>
              ) : subscription.lastPushedAt ? (
                <span className="text-muted">
                  Utoljára feltöltve:{" "}
                  {formatDistanceToNow(new Date(subscription.lastPushedAt), {
                    addSuffix: true,
                    locale: hu,
                  })}
                </span>
              ) : (
                <span className="text-muted">Még nem töltődött fel</span>
              )}
            </p>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled={busy !== null} onClick={handleRotate}>
                {busy === "rotate" ? spinner : <RefreshCw className="h-4 w-4" />}
                Új link
              </Button>
              <Button type="button" variant="ghost" disabled={busy !== null} onClick={handleDisable}>
                {busy === "delete" && spinner}
                Kikapcsolás
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}
      </Card>
    </section>
  );
}
