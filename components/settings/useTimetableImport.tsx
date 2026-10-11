"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useStore, type SubjectDecision } from "@/lib/store";
import {
  mappedCourse,
  parseNeptunEvents,
  summarizeSubjects,
  importFloor,
  isStaleSemester,
  timetableCutoff,
  upcomingSessions,
  type ParsedSession,
} from "@/lib/ical/neptun";
import { normalizeSemesterStart, proposeSemesterStartAt } from "@/lib/timetable/semester";
import type { IcalEventDTO } from "@/lib/ical/types";
import { TimetableMappingDialog } from "@/components/TimetableMappingDialog";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";

const SOURCE_NAME = "Neptun órarend";
const DAY_MS = 24 * 60 * 60 * 1000;

export const NO_UPCOMING_ERROR =
  "A naptárban nincs a mostani félévhez tartozó óra (a korábbi félévek órái nem kerülnek be).";
const EMPTY_ERROR = "A naptárban nincs egyetlen esemény sem";

interface PendingImport {
  parsed: ParsedSession[];
  /** Import floor (ISO). */
  from: string;
  sourceId?: string;
  url?: string;
}

export interface TimetableImportOptions {
  /** Re-import into an existing source (keeps its subject mapping). */
  sourceId?: string;
  /** Set when the calendar came from a link, so it can be re-fetched later. */
  url?: string;
}

/** The semester start is asked first, from the whole export, so this semester's past weeks come too. */
interface SemesterQuestion {
  events: IcalEventDTO[];
  opts: TimetableImportOptions;
  proposal: string;
}

export interface TimetableImport {
  /** Starts an import of Neptun events. Returns an error message, or null when it went (or is going) well. */
  importEvents: (events: IcalEventDTO[], opts?: TimetableImportOptions) => string | null;
  editMapping: (sourceId: string) => void;
  /** The mapping dialogs; render once. */
  dialogs: ReactNode;
}

/** Timetable import orchestration: current-semester filter, subject mapping dialog, store import. */
export function useTimetableImport(): TimetableImport {
  const sessions = useStore((s) => s.classSessions);
  const sources = useStore((s) => s.timetableSources);
  const importTimetable = useStore((s) => s.importTimetable);
  const remapTimetable = useStore((s) => s.remapTimetable);

  const [pending, setPending] = useState<PendingImport | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [semesterQuestion, setSemesterQuestion] = useState<SemesterQuestion | null>(null);

  /** Subjects (and groups) the dialog has to ask about: all of them, or only the new ones on a re-import. */
  function subjectsToAsk(p: PendingImport) {
    const known = knownMapping(p);
    return summarizeSubjects(p.parsed.filter((s) => mappedCourse({ subjectCourses: known }, s) === undefined));
  }

  function knownMapping(p: PendingImport): Record<string, string | null> {
    return (p.sourceId ? useStore.getState().timetableSources.find((s) => s.id === p.sourceId)?.subjectCourses : undefined) ?? {};
  }

  function importEvents(events: IcalEventDTO[], opts: TimetableImportOptions = {}, askSemester = true): string | null {
    const all = parseNeptunEvents(events);
    if (all.length === 0) return EMPTY_ERROR;
    // The whole current semester comes (attendance refers to its past weeks), never an earlier term.
    const now = new Date();
    const semester = useStore.getState().semester;
    if (askSemester) {
      const proposal = proposeSemesterStartAt(all, now);
      // A proposal after this week is the next term (exam period): only asked when nothing is stored.
      const current = proposal !== null && Date.parse(proposal) <= timetableCutoff(now).getTime() + DAY_MS;
      if (proposal && (!semester || (current && isStaleSemester(semester.start, proposal)))) {
        setSemesterQuestion({ events, opts, proposal });
        return null;
      }
    }
    const floor = importFloor(all, now, semester?.start);
    const parsed = upcomingSessions(all, now, floor);
    if (parsed.length === 0) return NO_UPCOMING_ERROR;
    const next: PendingImport = { parsed, from: floor.toISOString(), sourceId: opts.sourceId, url: opts.url };
    if (subjectsToAsk(next).length === 0) {
      importTimetable({ sourceId: next.sourceId, name: SOURCE_NAME, url: next.url, from: next.from }, next.parsed, {});
    } else {
      setPending(next);
    }
    return null;
  }

  const editing = editingId ? sources.find((s) => s.id === editingId) : undefined;
  const editSubjects = useMemo(
    () => summarizeSubjects(sessions.filter((s) => s.sourceId === editingId)),
    [sessions, editingId]
  );

  function answerSemester(start: string | null) {
    const question = semesterQuestion;
    setSemesterQuestion(null);
    if (!question) return;
    if (start) useStore.getState().setSemester(start);
    importEvents(question.events, question.opts, false);
  }

  const dialogs = (
    <>
      <Dialog open={semesterQuestion !== null} onClose={() => answerSemester(null)} title="Mikor kezdődött a félév?">
        {semesterQuestion && <SemesterStep proposal={semesterQuestion.proposal} onAnswer={answerSemester} />}
      </Dialog>
      <TimetableMappingDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Órarendi tárgyak hozzárendelése"
        subjects={pending ? subjectsToAsk(pending) : []}
        initial={pending ? knownMapping(pending) : {}}
        onConfirm={(decisions: Record<string, SubjectDecision>) => {
          if (!pending) return;
          importTimetable({ sourceId: pending.sourceId, name: SOURCE_NAME, url: pending.url, from: pending.from }, pending.parsed, decisions);
        }}
      />
      <TimetableMappingDialog
        open={editing !== undefined}
        onClose={() => setEditingId(null)}
        title="Hozzárendelés szerkesztése"
        subjects={editSubjects}
        initial={editing?.subjectCourses ?? {}}
        onConfirm={(decisions) => {
          if (editingId) remapTimetable(editingId, decisions);
        }}
      />
    </>
  );

  return { importEvents, editMapping: setEditingId, dialogs };
}

/** Week 1 of the teaching period, proposed from the timetable; week numbers count from it. */
function SemesterStep({ proposal, onAnswer }: { proposal: string; onAnswer: (start: string | null) => void }) {
  const [draft, setDraft] = useState(proposal);
  const normalized = draft ? normalizeSemesterStart(draft) : null;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] text-muted">
        Ettől számoljuk a heteket, például „röpzh a 2. héttől”. Az órarended alapján ezt javasoljuk; bármelyik napját
        megadhatod, a hét hétfőjét vesszük.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className="text-[14px] font-semibold text-heading">A szorgalmi időszak első hete</span>
        <Input type="date" value={draft} onChange={(e) => setDraft(e.target.value)} className="!w-auto" />
      </label>
      <DialogActions>
        <Button type="button" variant="secondary" onClick={() => onAnswer(null)}>
          Kihagyás
        </Button>
        <Button type="button" disabled={!normalized} onClick={() => onAnswer(normalized)}>
          Mentés
        </Button>
      </DialogActions>
    </div>
  );
}
