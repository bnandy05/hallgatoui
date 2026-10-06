"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { timetableCutoff } from "@/lib/ical/neptun";
import { budapestDate, isoWeekday } from "@/lib/ical/budapest";
import { deadlineIdentity } from "@/lib/ical/dedupe";
import { instanceLabel, resolveInstances, shortDayLabel } from "@/lib/rules/instances";
import {
  isMultiInstance,
  linkModes,
  linkTargets,
  type ComponentLink,
  type LinkMode,
  type LinkTarget,
  type SessionSelector,
} from "@/lib/rules/links";
import { askComponents } from "@/lib/suggest/client";
import { componentOption, localDeadlineMatches } from "@/lib/suggest/componentMatch";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Pill } from "@/components/ui/Pill";
import { SemesterField } from "@/components/settings/SemesterField";

// Ties one requirement component to the student's calendar: every class (attendance, röpzh),
// given teaching weeks (a zh in week 9) or picked deadlines (beadandó, Canvas quizzes).

const MODE_TEXT: Record<LinkMode, string> = { sessions: "Órák", weeks: "Hetek", deadlines: "Határidők" };
const WEEKDAYS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];

export function ComponentLinkDialog({
  open,
  onClose,
  courseId,
  target,
  link,
}: {
  open: boolean;
  onClose: () => void;
  courseId: string;
  target: LinkTarget;
  link: ComponentLink | undefined;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={`${target.label}: időpontok`} size="lg">
      <LinkForm courseId={courseId} target={target} link={link} onClose={onClose} />
    </Dialog>
  );
}

function parseWeeks(text: string): number[] {
  return [...new Set(text.split(/[^0-9]+/).filter(Boolean).map(Number).filter((n) => n >= 1 && n <= 60))].sort((a, b) => a - b);
}

function LinkForm({
  courseId,
  target,
  link,
  onClose,
}: {
  courseId: string;
  target: LinkTarget;
  link: ComponentLink | undefined;
  onClose: () => void;
}) {
  const allSessions = useStore((s) => s.classSessions);
  const deadlines = useStore((s) => s.deadlines);
  const semester = useStore((s) => s.semester);
  const setComponentLink = useStore((s) => s.setComponentLink);
  const modes = linkModes(target);
  const multi = isMultiInstance(target);

  const sessions = useMemo(() => allSessions.filter((s) => s.courseId === courseId), [allSessions, courseId]);
  const groups = useMemo(() => [...new Set(sessions.map((s) => s.group).filter((g): g is string => !!g))].sort(), [sessions]);
  const weekdays = useMemo(() => [...new Set(sessions.filter((s) => s.kind === "ora").map((s) => isoWeekday(budapestDate(new Date(s.start)))))].sort(), [sessions]);
  const hasExams = sessions.some((s) => s.kind === "vizsga");
  const courseDeadlines = useMemo(
    () => deadlines.filter((d) => d.courseId === courseId).sort((a, b) => a.due.localeCompare(b.due)),
    [deadlines, courseId]
  );

  // Children mount per open: initialise from the current link.
  const initialSelector: SessionSelector = link && link.mode !== "deadlines" ? (link.selector ?? {}) : {};
  const [mode, setMode] = useState<LinkMode | "none">(link?.mode ?? "none");
  const [selector, setSelector] = useState<SessionSelector>(initialSelector);
  const [limit, setLimit] = useState(link?.mode === "sessions" && link.limit ? String(link.limit) : "");
  const [weeksText, setWeeksText] = useState(link?.mode === "weeks" ? link.weeks.join(", ") : "");
  const ruleSet = useStore((s) => s.requirementRules.find((r) => r.courseId === courseId));
  const targets = useMemo(() => (ruleSet ? linkTargets(ruleSet) : [target]), [ruleSet, target]);
  // Kind words and numbers first; only when they find nothing does Jev get the course's deadlines.
  const [local] = useState(() => localDeadlineMatches(target, targets, courseId, deadlines).map(deadlineIdentity));
  const [picked, setPicked] = useState<Set<string>>(() => {
    if (link?.mode === "deadlines") return new Set(link.identities);
    return new Set(multi ? local : local.slice(0, 1));
  });
  const pickedByHand = useRef(false);
  const [jevPicked, setJevPicked] = useState(false);
  useEffect(() => {
    if (link || local.length > 0 || courseDeadlines.length === 0 || !modes.includes("deadlines")) return;
    let cancelled = false;
    const asked = courseDeadlines.slice(-20); // the latest ones; they are what is still open
    const index = targets.findIndex((t) => t.id === target.id);
    void askComponents(
      asked.map((d) => d.title),
      targets.map(componentOption)
    ).then((answers) => {
      if (cancelled || !answers || pickedByHand.current) return;
      const mine = asked.filter((_, i) => answers[i] === index).map(deadlineIdentity);
      if (mine.length === 0) return;
      setPicked(new Set(multi ? mine : mine.slice(0, 1)));
      setJevPicked(true);
    });
    return () => {
      cancelled = true;
    };
    // Asked once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const defaultSince = useMemo(() => timetableCutoff(new Date()).toISOString(), []);
  const [askEarlier, setAskEarlier] = useState(!!link && !link.since);
  const since = askEarlier ? undefined : (link?.since ?? defaultSince);

  const draft: ComponentLink | null = useMemo(() => {
    if (mode === "sessions") {
      const n = Number(limit);
      return { mode, selector, ...(Number.isInteger(n) && n > 0 && { limit: n }), ...(since && { since }) };
    }
    if (mode === "weeks") {
      const weeks = parseWeeks(weeksText);
      if (weeks.length === 0) return null;
      const sel = { ...selector, fromWeek: undefined, toWeek: undefined };
      const hasSel = !!(sel.groups?.length || sel.kinds?.length || sel.weekdays?.length);
      return { mode, weeks: multi ? weeks : weeks.slice(0, 1), ...(hasSel && { selector: sel }), ...(since && { since }) };
    }
    if (mode === "deadlines") {
      const identities = courseDeadlines.map(deadlineIdentity).filter((id) => picked.has(id));
      // Keep picked deadlines that are gone from the course list (moved, or the feed is off).
      for (const id of picked) if (!identities.includes(id)) identities.push(id);
      if (identities.length === 0) return null;
      return { mode, identities: multi ? identities : identities.slice(0, 1), ...(since && { since }) };
    }
    return null;
  }, [mode, selector, limit, weeksText, picked, courseDeadlines, multi, since]);

  const preview = useMemo(() => {
    if (!draft) return [];
    return resolveInstances(target, draft, { courseId, sessions: allSessions, deadlines, semester, results: [] });
  }, [draft, target, courseId, allSessions, deadlines, semester]);

  const needsSemester = !semester && (mode === "weeks" || (mode === "sessions" && (selector.fromWeek || selector.toWeek)));

  function toggleIn<T>(list: T[] | undefined, value: T): T[] | undefined {
    const next = list?.includes(value) ? list.filter((x) => x !== value) : [...(list ?? []), value];
    return next.length > 0 ? next : undefined;
  }

  function save() {
    setComponentLink(courseId, target.id, mode === "none" ? null : draft);
    onClose();
  }

  const weekInput = (key: "fromWeek" | "toWeek", text: string) => (
    <div className="w-28">
      <Label htmlFor={`link-${key}`}>{text}</Label>
      <Input
        id={`link-${key}`}
        inputMode="numeric"
        value={selector[key] ?? ""}
        placeholder="–"
        onChange={(e) => {
          const n = Number(e.target.value);
          setSelector({ ...selector, [key]: e.target.value && Number.isInteger(n) && n >= 1 && n <= 60 ? n : undefined });
        }}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Mihez kötöd?">
        <Pill active={mode === "none"} onClick={() => setMode("none")}>
          Nincs
        </Pill>
        {modes.map((m) => (
          <Pill key={m} active={mode === m} onClick={() => setMode(m)}>
            {MODE_TEXT[m]}
          </Pill>
        ))}
      </div>

      {mode === "none" && (
        <p className="text-[14px] text-muted">
          Időpont nélkül az eredményeket a tárgy oldalán rögzítheted, de az óráid után nem kérdezünk rá.
        </p>
      )}

      {(mode === "sessions" || mode === "weeks") && sessions.length === 0 && (
        <p className="rounded-[var(--radius)] bg-canary px-3 py-2 text-[13.5px] text-heading">
          Ehhez a tárgyhoz még nincs óra az órarendedben. Importáld a Neptun-órarendet a Beállítások → Naptárak alatt.
        </p>
      )}

      {mode === "sessions" && (
        <div className="flex flex-col gap-4">
          <p className="text-[14px] text-muted">
            {multi ? "Minden óra egy alkalom, " : ""}az elmaradt órák nem számítanak bele.
          </p>
          {groups.length > 1 && (
            <div>
              <p className="mb-1.5 text-[13.5px] font-semibold text-heading">Csoport</p>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <Pill key={g} active={!!selector.groups?.includes(g)} onClick={() => setSelector({ ...selector, groups: toggleIn(selector.groups, g) })}>
                    {g}. csoport
                  </Pill>
                ))}
              </div>
              <p className="mt-1 text-[12.5px] text-muted-dim">Ha egyiket sem jelölöd, mindegyik csoport óráit vesszük.</p>
            </div>
          )}
          {weekdays.length > 1 && (
            <div>
              <p className="mb-1.5 text-[13.5px] font-semibold text-heading">Nap</p>
              <div className="flex flex-wrap gap-2">
                {weekdays.map((d) => (
                  <Pill key={d} active={!!selector.weekdays?.includes(d)} onClick={() => setSelector({ ...selector, weekdays: toggleIn(selector.weekdays, d) })}>
                    {WEEKDAYS[d - 1]}
                  </Pill>
                ))}
              </div>
            </div>
          )}
          {hasExams && (
            <label className="inline-flex items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={!!selector.kinds?.includes("vizsga")}
                onChange={(e) => setSelector({ ...selector, kinds: e.target.checked ? ["ora", "vizsga"] : undefined })}
              />
              A vizsgaalkalmak is
            </label>
          )}
          <div className="flex flex-wrap items-end gap-3">
            {weekInput("fromWeek", "Héttől")}
            {weekInput("toWeek", "Hétig")}
            <div className="w-28">
              <Label htmlFor="link-limit">Legfeljebb</Label>
              <Input
                id="link-limit"
                inputMode="numeric"
                value={limit}
                placeholder={target.kind === "series" ? String(target.count) : "–"}
                onChange={(e) => setLimit(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
          </div>
        </div>
      )}

      {mode === "weeks" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="link-weeks">{multi ? "Hetek (vesszővel elválasztva)" : "Hét"}</Label>
          <Input id="link-weeks" inputMode="numeric" value={weeksText} placeholder={multi ? "pl. 4, 9, 13" : "pl. 9"} onChange={(e) => setWeeksText(e.target.value)} className="max-w-xs" />
          <p className="text-[12.5px] text-muted-dim">Az időpontot az adott heti órádból vesszük; ha aznap nincs órád, a hét végén kérdezünk rá.</p>
        </div>
      )}

      {needsSemester && <SemesterField compact />}

      {mode === "deadlines" && (
        <div className="flex flex-col gap-2">
          {courseDeadlines.length === 0 ? (
            <p className="text-[14px] text-muted">Ennek a tárgynak még nincs határideje.</p>
          ) : (
            <ul className="-mx-1 flex max-h-72 flex-col overflow-y-auto">
              {courseDeadlines.map((d) => {
                const id = deadlineIdentity(d);
                return (
                  <li key={d.id}>
                    <label className="flex items-start gap-2.5 rounded-[var(--radius)] px-1 py-1.5 hover:bg-wash/[0.04]">
                      <input
                        type={multi ? "checkbox" : "radio"}
                        name="link-deadline"
                        className="mt-1"
                        checked={picked.has(id)}
                        onChange={() => {
                          pickedByHand.current = true;
                          setJevPicked(false);
                          setPicked((prev) => {
                            if (!multi) return new Set([id]);
                            const next = new Set(prev);
                            if (next.has(id)) next.delete(id);
                            else next.add(id);
                            return next;
                          });
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block text-[14px] text-foreground [overflow-wrap:anywhere]">{d.title}</span>
                        <span className="block text-[12.5px] tabular-nums text-muted">{shortDayLabel(new Date(d.due))}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {jevPicked && <p className="text-[12.5px] text-muted">A kijelölés a Jev javaslata, ellenőrizd.</p>}
        </div>
      )}

      {mode !== "none" && (
        <>
          <div className="rounded-[var(--radius)] bg-strip px-3 py-2.5 text-[13.5px]">
            {preview.length === 0 ? (
              <span className="text-muted">Még nincs ide illő alkalom.</span>
            ) : (
              <>
                <span className="font-semibold text-heading">{preview.length} alkalom: </span>
                <span className="text-muted">
                  {preview.slice(0, 5).map(instanceLabel).join("; ")}
                  {preview.length > 5 && "; …"}
                </span>
              </>
            )}
          </div>
          <label className="inline-flex items-start gap-2 text-[14px]">
            <input type="checkbox" className="mt-1" checked={askEarlier} onChange={(e) => setAskEarlier(e.target.checked)} />
            <span>
              A korábbi alkalmakra is rákérdezünk
              <span className="block text-[12.5px] text-muted-dim">
                Különben csak az e heti és későbbi alkalmak kerülnek a „Mi történt az óráidon?” ablakba; a korábbiakat itt, a tárgy oldalán töltheted ki.
              </span>
            </span>
          </label>
        </>
      )}

      <DialogActions>
        <Button type="button" variant="secondary" onClick={onClose}>
          Mégse
        </Button>
        <Button type="button" onClick={save} disabled={mode !== "none" && !draft}>
          Mentés
        </Button>
      </DialogActions>
    </div>
  );
}
