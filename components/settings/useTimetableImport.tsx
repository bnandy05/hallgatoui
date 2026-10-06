"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useStore, type SubjectDecision } from "@/lib/store";
import {
  mappedCourse,
  parseNeptunEvents,
  summarizeSubjects,
  upcomingSessions,
  type ParsedSession,
} from "@/lib/ical/neptun";
import { budapestInstant } from "@/lib/ical/budapest";
import { parseYmd } from "@/lib/timetable/semester";
import type { IcalEventDTO } from "@/lib/ical/types";
import { TimetableMappingDialog } from "@/components/TimetableMappingDialog";

const SOURCE_NAME = "Neptun órarend";

export const NO_UPCOMING_ERROR =
  "A naptárban nincs aktuális vagy jövőbeli óra (a korábbi félévek órái nem kerülnek be).";
const EMPTY_ERROR = "A naptárban nincs egyetlen esemény sem";

interface PendingImport {
  parsed: ParsedSession[];
  sourceId?: string;
  url?: string;
}

export interface TimetableImportOptions {
  /** Re-import into an existing source (keeps its subject mapping). */
  sourceId?: string;
  /** Set when the calendar came from a link, so it can be re-fetched later. */
  url?: string;
}

export interface TimetableImport {
  /** Starts an import of Neptun events. Returns an error message, or null when it went (or is going) well. */
  importEvents: (events: IcalEventDTO[], opts?: TimetableImportOptions) => string | null;
  editMapping: (sourceId: string) => void;
  /** The mapping dialogs; render once. */
  dialogs: ReactNode;
}

/** Timetable import orchestration: future-only filter, subject mapping dialog, store import. */
export function useTimetableImport(): TimetableImport {
  const sessions = useStore((s) => s.classSessions);
  const sources = useStore((s) => s.timetableSources);
  const importTimetable = useStore((s) => s.importTimetable);
  const remapTimetable = useStore((s) => s.remapTimetable);

  const [pending, setPending] = useState<PendingImport | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  /** Subjects (and groups) the dialog has to ask about: all of them, or only the new ones on a re-import. */
  function subjectsToAsk(p: PendingImport) {
    const known = knownMapping(p);
    return summarizeSubjects(p.parsed.filter((s) => mappedCourse({ subjectCourses: known }, s) === undefined));
  }

  function knownMapping(p: PendingImport): Record<string, string | null> {
    return (p.sourceId ? useStore.getState().timetableSources.find((s) => s.id === p.sourceId)?.subjectCourses : undefined) ?? {};
  }

  function importEvents(events: IcalEventDTO[], opts: TimetableImportOptions = {}): string | null {
    const all = parseNeptunEvents(events);
    if (all.length === 0) return EMPTY_ERROR;
    // With a semester start, this semester's earlier classes come too (attendance refers to them).
    const semester = useStore.getState().semester;
    const start = semester ? parseYmd(semester.start) : null;
    const parsed = upcomingSessions(all, new Date(), start ? budapestInstant(start, 0, 0) : undefined);
    if (parsed.length === 0) return NO_UPCOMING_ERROR;
    const next: PendingImport = { parsed, sourceId: opts.sourceId, url: opts.url };
    if (subjectsToAsk(next).length === 0) {
      importTimetable({ sourceId: next.sourceId, name: SOURCE_NAME, url: next.url }, next.parsed, {});
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

  const dialogs = (
    <>
      <TimetableMappingDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Órarendi tárgyak hozzárendelése"
        subjects={pending ? subjectsToAsk(pending) : []}
        initial={pending ? knownMapping(pending) : {}}
        onConfirm={(decisions: Record<string, SubjectDecision>) => {
          if (!pending) return;
          importTimetable({ sourceId: pending.sourceId, name: SOURCE_NAME, url: pending.url }, pending.parsed, decisions);
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
