"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { CalendarPlus, Download, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { parseView, viewParam } from "@/lib/ical/views";
import { userExceptions } from "@/lib/ical/dedupe";
import {
  createCalendarToken,
  deleteCalendarToken,
  downloadCalendar,
  fetchCalendarToken,
  rotateCalendarToken,
  subscriptionPath,
} from "@/lib/subscription/client";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { CopyField } from "@/components/ui/CopyField";
import { Switch } from "@/components/ui/Switch";
import { SectionHeading } from "@/components/ui/SectionHeading";

type Busy = "create" | "rotate" | "delete" | null;

export function CalendarSubscriptionSettings() {
  const courses = useStore((s) => s.courses);
  const exportOptions = useStore((s) => s.exportOptions);
  const setExportOptions = useStore((s) => s.setExportOptions);
  const ignoredCount = useStore((s) => userExceptions(s.ignoredDuplicatePairs).length);
  const clearIgnoredDuplicates = useStore((s) => s.clearIgnoredDuplicates);

  // undefined: still loading; null: the subscription is off.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewValue, setViewValue] = useState("osszes");

  useEffect(() => {
    let cancelled = false;
    void fetchCalendarToken().then((result) => {
      if (cancelled) return;
      if ("error" in result) setError(result.error);
      else setToken(result.token);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(
    kind: Exclude<Busy, null>,
    action: () => Promise<{ token: string | null } | { error: string }>
  ) {
    setBusy(kind);
    setError(null);
    const result = await action();
    if ("error" in result) setError(result.error);
    else setToken(result.token);
    setBusy(null);
  }

  function handleRotate() {
    if (
      !confirm(
        "Új linket kapsz, a régi megszűnik. Az Apple vagy a Google Naptárban újra hozzá kell adnod a naptárat. Folytatod?"
      )
    ) {
      return;
    }
    void run("rotate", rotateCalendarToken);
  }

  function handleDisable() {
    if (!confirm("Kikapcsolod? A feliratkozási link megszűnik, az adataid a fiókodban megmaradnak.")) {
      return;
    }
    void run("delete", async () => {
      const message = await deleteCalendarToken();
      return message ? { error: message } : { token: null };
    });
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  // A deleted course falls back to the full calendar, like the server does.
  const view = parseView(viewValue, courses);
  const query = view.kind === "all" ? "" : `?nezet=${encodeURIComponent(viewParam(view))}`;
  const path = token ? `${subscriptionPath(token)}${query}` : "";
  const httpsUrl = `${origin}${path}`;
  const webcalUrl = `webcal://${origin.replace(/^https?:\/\//, "")}${path}`;
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
  const spinner = <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <section id="naptar-exportalas" className="flex flex-col gap-8">
      <SectionHeading
        title="Naptár exportálása"
        sub="Minden tárgyad és határidőd egyetlen naptárban, amelyet hozzáadhatsz az Apple vagy a Google Naptárhoz."
      />

      {token === undefined ? (
        error ? (
          <p className="text-[13px] font-semibold text-danger">{error}</p>
        ) : (
          <div className="h-40 rounded-[var(--radius-slip)] bg-strip/80" />
        )
      ) : token === null ? (
        <div className="slip flex flex-col gap-4 bg-card px-5 pb-5 pt-6">
          <span aria-hidden="true" className="pin -top-[4px] left-5" style={{ "--pin-color": "var(--pin-neutral)" } as CSSProperties} />
          <p className="font-display text-[22px] text-heading">Automatikusan frissülő naptár</p>
          <div className="flex gap-2.5 rounded-[var(--radius)] bg-canary/60 p-3 text-[13.5px] text-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              A feliratkozási link titkos: aki ismeri, megtekintheti vele a tárgyaidat és a határidőidet. A szerver
              rendszeresen frissíti a naptárforrásaidat (ezek linkjei privát Canvas- vagy Moodle-tokent is
              tartalmazhatnak), így a naptárad akkor is naprakész, ha az oldal nincs megnyitva. Kikapcsolás után a
              link megszűnik.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy !== null} onClick={() => void run("create", createCalendarToken)}>
              {busy === "create" ? spinner : <CalendarPlus className="h-4 w-4" />}
              Feliratkozási link létrehozása
            </Button>
            <Button type="button" variant="secondary" onClick={downloadCalendar}>
              <Download className="h-4 w-4" />
              Letöltés (.ics)
            </Button>
          </div>
          <p className="text-[13px] text-muted">
            A letöltött fájl az aktuális állapotot tartalmazza, később nem frissül.
          </p>
          {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
        </div>
      ) : (
        <div className="slip flex flex-col gap-4 bg-card px-5 pb-5 pt-6">
          <span aria-hidden="true" className="pin -top-[4px] left-5" style={{ "--pin-color": "var(--success)" } as CSSProperties} />
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-display text-[22px] text-heading">Feliratkozási link</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
            <div className="min-w-0">
              <CopyField value={httpsUrl} label="Feliratkozási link" />
              <p className="mt-2 text-[12.5px] text-muted">Aki ismeri a linket, megtekintheti a naptáradat, ezért ne oszd meg.</p>
            </div>
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
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
            <a href={webcalUrl} className={buttonClasses({ variant: "secondary" })}>
              Hozzáadás az Apple Naptárhoz
            </a>
            <a href={googleUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary" })}>
              Hozzáadás a Google Naptárhoz
            </a>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted">
            <li>Minden nézet külön naptárként is hozzáadható, így például tárgyanként eltérő színt kaphatnak.</li>
            <li>A Google Naptár 8–24 óránként frissít; ez nem gyorsítható, és az emlékeztetőket nem veszi át.</li>
            <li>Az Apple Naptárban a naptár beállításainál állíthatod a frissítés gyakoriságát.</li>
          </ul>
          {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="font-display text-[22px] text-heading">Tartalom</h3>
        <div className="sheet-paper divide-y divide-border/70 px-5 py-1">
          <Switch
            checked={exportOptions.includeDone}
            onChange={(v) => setExportOptions({ includeDone: v })}
            label="Kész határidők"
            description="A kipipált határidők is megmaradnak a naptárban."
          />
          <Switch
            checked={exportOptions.includeClasses}
            onChange={(v) => setExportOptions({ includeClasses: v })}
            label="Órarend"
            description="A Neptun-órák a teljes és a tárgyankénti nézetben."
          />
          <Switch
            checked={exportOptions.dedupe}
            onChange={(v) => setExportOptions({ dedupe: v })}
            label="Duplikátumok összevonása"
            description={
              <>
                A több forrásból érkező azonos határidők egyszer jelennek meg, itt és a naptárban is.
                {ignoredCount > 0 && (
                  <button
                    type="button"
                    onClick={clearIgnoredDuplicates}
                    className="ml-1 font-semibold text-heading underline"
                  >
                    Kivételek törlése ({ignoredCount})
                  </button>
                )}
              </>
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-display text-[22px] text-heading">Kiegészítések</h3>
        <div className="sheet-paper divide-y divide-border/70 px-5 py-1">
          <Switch
            checked={exportOptions.alarms}
            onChange={(v) => setExportOptions({ alarms: v })}
            label="Emlékeztető"
            description="Értesítés a kritikus határidők előtt."
          />
          <Switch
            checked={exportOptions.weeklySummary}
            onChange={(v) => setExportOptions({ weeklySummary: v })}
            label="Heti összefoglaló"
            description="Egész napos „Heti radar” esemény minden hétfőn."
          />
          <Switch
            checked={exportOptions.studyBlocks}
            onChange={(v) => setExportOptions({ studyBlocks: v })}
            label="Felkészülési idő"
            description="Két egész napos blokk a kritikus határidők előtt."
          />
        </div>
      </div>

      {token && (
        <div className="flex flex-wrap items-center gap-2 border-t border-felt-dark pt-5">
          <Button type="button" variant="secondary" onClick={downloadCalendar}>
            <Download className="h-4 w-4" />
            Letöltés (.ics)
          </Button>
          <Button type="button" variant="secondary" disabled={busy !== null} onClick={handleRotate}>
            {busy === "rotate" ? spinner : <RefreshCw className="h-4 w-4" />}
            Új link
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy !== null}
            onClick={handleDisable}
            className="text-danger hover:!bg-danger/10 sm:ml-auto"
          >
            {busy === "delete" && spinner}
            Feliratkozási link kikapcsolása
          </Button>
        </div>
      )}
    </section>
  );
}
