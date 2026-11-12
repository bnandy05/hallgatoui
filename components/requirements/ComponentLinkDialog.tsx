"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
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
import { Checkbox } from "@/components/ui/Checkbox";
import { Label } from "@/components/ui/Label";
import { Pill } from "@/components/ui/Pill";
import { SemesterField } from "@/components/settings/SemesterField";

// Ties one requirement component to the student's calendar: every class (attendance, röpzh),
// given teaching weeks (a zh in week 9) or picked deadlines (beadandó, Canvas quizzes).

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
  const t = useT();
  return (
    <Dialog open={open} onClose={onClose} title={t.componentLink.title(target.label)} size="lg">
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
  const tAll = useT();
  const t = tAll.componentLink;
  const locale = useLocale();
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

  function toggle(id: string) {
    pickedByHand.current = true;
    setJevPicked(false);
    setPicked((prev) => {
      if (!multi) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      <div className="flex flex-wrap gap-2" role="group" aria-label={t.modeLabel}>
        <Pill active={mode === "none"} onClick={() => setMode("none")}>
          {t.none}
        </Pill>
        {modes.map((m) => (
          <Pill key={m} active={mode === m} onClick={() => setMode(m)}>
            {t.modes[m]}
          </Pill>
        ))}
      </div>

      {mode === "none" && (
        <p className="text-body text-muted">{t.noneHint}</p>
      )}

      {(mode === "sessions" || mode === "weeks") && sessions.length === 0 && (
        <p className="rounded-[var(--radius)] bg-canary px-3 py-2 text-small text-heading">
          {t.noSessions}
        </p>
      )}

      {mode === "sessions" && (
        <div className="flex flex-col gap-4">
          <p className="text-body text-muted">{t.sessionsHint(multi)}</p>
          {groups.length > 1 && (
            <div>
              <p className="mb-1.5 text-small font-semibold text-heading">{t.group}</p>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <Pill key={g} active={!!selector.groups?.includes(g)} onClick={() => setSelector({ ...selector, groups: toggleIn(selector.groups, g) })}>
                    {t.groupN(g)}
                  </Pill>
                ))}
              </div>
              <p className="mt-1 text-fine text-muted-dim">{t.groupHint}</p>
            </div>
          )}
          {weekdays.length > 1 && (
            <div>
              <p className="mb-1.5 text-small font-semibold text-heading">{t.day}</p>
              <div className="flex flex-wrap gap-2">
                {weekdays.map((d) => (
                  <Pill key={d} active={!!selector.weekdays?.includes(d)} onClick={() => setSelector({ ...selector, weekdays: toggleIn(selector.weekdays, d) })}>
                    {tAll.rules.instances.weekdaysShort[d - 1]}
                  </Pill>
                ))}
              </div>
            </div>
          )}
          {hasExams && (
            <Checkbox
              label={t.withExams}
              checked={!!selector.kinds?.includes("vizsga")}
              onChange={(e) => setSelector({ ...selector, kinds: e.target.checked ? ["ora", "vizsga"] : undefined })}
            />
          )}
          <div className="flex flex-wrap items-end gap-3">
            {weekInput("fromWeek", t.fromWeek)}
            {weekInput("toWeek", t.toWeek)}
            <div className="w-28">
              <Label htmlFor="link-limit">{t.atMost}</Label>
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
          <Label htmlFor="link-weeks">{multi ? t.weeksMulti : t.weekSingle}</Label>
          <Input id="link-weeks" inputMode="numeric" value={weeksText} placeholder={multi ? t.weeksPlaceholderMulti : t.weeksPlaceholderSingle} onChange={(e) => setWeeksText(e.target.value)} className="max-w-xs" />
          <p className="text-fine text-muted-dim">{t.weeksHint}</p>
        </div>
      )}

      {needsSemester && <SemesterField compact />}

      {mode === "deadlines" && (
        <div className="flex flex-col gap-2">
          {courseDeadlines.length === 0 ? (
            <p className="text-body text-muted">{t.noDeadlines}</p>
          ) : (
            <ul className="-mx-1 flex max-h-72 flex-col overflow-y-auto">
              {courseDeadlines.map((d) => {
                const id = deadlineIdentity(d);
                return (
                  <li key={d.id}>
                    <label className="flex items-start gap-2.5 rounded-[var(--radius)] px-1 py-1.5 hover:bg-wash/[0.04]">
                      {multi ? (
                        <Checkbox
                          aria-label={d.title}
                          checked={picked.has(id)}
                          onChange={() => toggle(id)}
                        />
                      ) : (
                        <input type="radio" name="link-deadline" className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--accent)]" aria-label={d.title} checked={picked.has(id)} onChange={() => toggle(id)} />
                      )}
                      <span className="min-w-0">
                        <span className="block text-body text-foreground [overflow-wrap:anywhere]">{d.title}</span>
                        <span className="block text-fine tabular-nums text-muted">{shortDayLabel(new Date(d.due), locale)}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {jevPicked && <p className="text-fine text-muted">{t.jevPicked}</p>}
        </div>
      )}

      {mode !== "none" && (
        <>
          <div className="rounded-[var(--radius)] bg-strip px-3 py-2.5 text-small">
            {preview.length === 0 ? (
              <span className="text-muted">{t.noMatch}</span>
            ) : (
              <>
                <span className="font-semibold text-heading">{t.occasions(preview.length)}</span>
                <span className="text-muted">
                  {preview.slice(0, 5).map((i) => instanceLabel(i, locale)).join("; ")}
                  {preview.length > 5 && "; …"}
                </span>
              </>
            )}
          </div>
          <Checkbox
            checked={askEarlier}
            onChange={(e) => setAskEarlier(e.target.checked)}
            label={t.askEarlier}
            description={t.askEarlierHint}
          />
        </>
      )}

      <DialogActions>
        <Button type="button" variant="secondary" onClick={onClose}>
          {tAll.common.cancel}
        </Button>
        <Button type="button" onClick={save} disabled={mode !== "none" && !draft}>
          {tAll.common.save}
        </Button>
      </DialogActions>
    </div>
  );
}
