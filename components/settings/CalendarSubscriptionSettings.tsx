"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { hu } from "date-fns/locale";
import { CalendarPlus, Download, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
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
  const ignoredCount = useStore((s) => s.ignoredDuplicatePairs.length);
  const clearIgnoredDuplicates = useStore((s) => s.clearIgnoredDuplicates);

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
        title="Naptár-előfizetés"
        sub="Minden tárgyad és határidőd egyetlen naptárban, amelyre az Apple vagy a Google Naptárban előfizethetsz."
      />

      <Card className="flex flex-col gap-4">
        <div>
          <p className="mb-3 text-[14px] text-muted">
            Egyszeri letöltés a jelenlegi állapotról. Nem frissül magától, és nem kell hozzá előfizetés.
          </p>
          <Button type="button" variant="secondary" onClick={downloadCalendar}>
            <Download className="h-4 w-4" />
            Letöltés (.ics)
          </Button>
        </div>

        <div className="flex flex-col gap-2.5 border-t border-border pt-4 text-[14px] text-foreground">
          <p className="text-[13px] font-semibold text-heading">A naptár tartalma</p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={exportOptions.includeDone}
              onChange={(e) => setExportOptions({ includeDone: e.target.checked })}
              className="h-4 w-4 accent-accent"
            />
            Kész határidők
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={exportOptions.alarms}
              onChange={(e) => setExportOptions({ alarms: e.target.checked })}
              className="h-4 w-4 accent-accent"
            />
            Emlékeztető a kritikus határidők előtt
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
            Felkészülési idő a kritikus határidők előtt (2 nap)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={exportOptions.includeClasses}
              onChange={(e) => setExportOptions({ includeClasses: e.target.checked })}
              className="h-4 w-4 accent-accent"
            />
            Órarend a teljes és a tárgyankénti nézetben
          </label>
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={exportOptions.dedupe}
                onChange={(e) => setExportOptions({ dedupe: e.target.checked })}
                className="h-4 w-4 accent-accent"
              />
              Duplikátumok összevonása
            </label>
            <p className="ml-6 mt-0.5 text-[12.5px] text-muted">
              A több forrásból érkező azonos határidők egyszer jelennek meg, itt és a naptárban is.
            </p>
            {ignoredCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-6 mt-1"
                onClick={clearIgnoredDuplicates}
              >
                Kivételek törlése ({ignoredCount})
              </Button>
            )}
          </div>
        </div>

        {!subscription ? (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex gap-2.5 rounded-[var(--radius)] bg-canary/60 p-3 text-[13px] text-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                Bekapcsoláskor a tárgyaid, a határidőid és a naptárforrásaid linkje a szerverre kerül; a linkek
                privát Canvas- vagy Moodle-tokent is tartalmazhatnak. A szerver a forrásokat magától frissíti, így a
                naptárad akkor is naprakész, ha az oldal nincs nyitva. Kikapcsoláskor minden adatod törlődik a
                szerverről.
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
                <option value="osszes">Minden</option>
                <option value="kritikus">Csak kritikus</option>
                <option value="zh">ZH-k és vizsgák</option>
                <option value="orarend">Órarend</option>
                {courses.map((c) => (
                  <option key={c.id} value={`targy-${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-[12.5px] text-muted">
                Minden nézetre külön is előfizethetsz, így például tárgyanként más színt adhatsz nekik.
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-heading">Előfizetési link</p>
              <CodeBlock prompt={false}>{httpsUrl}</CodeBlock>
              <p className="mt-2 text-[12.5px] text-muted">
                A linkkel bárki megnézheti a naptáradat, ezért ne oszd meg.
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

            <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted">
              <li>
                A Google Naptár 8–24 óránként frissít, ezt nem lehet gyorsítani, és az emlékeztetőket sem veszi át.
              </li>
              <li>Az Apple Naptárban a naptár beállításainál állíthatod a frissítés gyakoriságát.</li>
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
