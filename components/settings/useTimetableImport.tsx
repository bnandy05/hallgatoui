"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useStore, type SubjectDecision } from "@/lib/store";
import {
  parseNeptunEvents,
  summarizeSubjects,
  upcomingSessions,
  type ParsedSession,
} from "@/lib/ical/neptun";
import type { IcalEventDTO } from "@/lib/ical/types";
import { useT } from "@/lib/i18n/I18nProvider";
import { TimetableMappingDialog } from "@/components/TimetableMappingDialog";

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
  const t = useT();
  const sessions = useStore((s) => s.classSessions);
  const sources = useStore((s) => s.timetableSources);
  const importTimetable = useStore((s) => s.importTimetable);
  const remapTimetable = useStore((s) => s.remapTimetable);

  const [pending, setPending] = useState<PendingImport | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  /** Subjects the dialog has to ask about: all of them, or only the new ones on a re-import. */
  function subjectsToAsk(p: PendingImport) {
    const known = p.sourceId
      ? useStore.getState().timetableSources.find((s) => s.id === p.sourceId)?.subjectCourses
      : undefined;
    return summarizeSubjects(p.parsed).filter((s) => !known || known[s.subjectKey] === undefined);
  }

  function importEvents(events: IcalEventDTO[], opts: TimetableImportOptions = {}): string | null {
    const all = parseNeptunEvents(events);
    if (all.length === 0) return t.timetable.empty;
    const parsed = upcomingSessions(all, new Date());
    if (parsed.length === 0) return t.timetable.noUpcoming;
    const next: PendingImport = { parsed, sourceId: opts.sourceId, url: opts.url };
    if (subjectsToAsk(next).length === 0) {
      importTimetable({ sourceId: next.sourceId, name: t.timetable.sourceName, url: next.url }, next.parsed, {});
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
        title={t.timetable.mappingTitle}
        subjects={pending ? subjectsToAsk(pending) : []}
        initial={{}}
        onConfirm={(decisions: Record<string, SubjectDecision>) => {
          if (!pending) return;
          importTimetable({ sourceId: pending.sourceId, name: t.timetable.sourceName, url: pending.url }, pending.parsed, decisions);
        }}
      />
      <TimetableMappingDialog
        open={editing !== undefined}
        onClose={() => setEditingId(null)}
        title={t.timetable.editMappingTitle}
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
