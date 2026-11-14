"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { autoLinks } from "@/lib/rules/links";
import { timetableCutoff } from "@/lib/ical/neptun";
import { useDedupedDeadlines } from "@/lib/useDedupedDeadlines";

// Links requirement components to classes and deadlines by themselves (`autoLinks`) whenever the
// rules, the timetable or the deadlines change: after saving rules, a Neptun import or a feed
// sync. Only after this tab's first server pull, so a stale cache never decides. Renders nothing.

export function RequirementAutoLink() {
  const rules = useStore((s) => s.requirementRules);
  const sessions = useStore((s) => s.classSessions);
  const results = useStore((s) => s.requirementResults);
  const pulled = useStore((s) => s.pulledThisSession);
  const applyAutoLinks = useStore((s) => s.applyAutoLinks);
  const { visible } = useDedupedDeadlines();

  useEffect(() => {
    if (!pulled) return;
    const since = timetableCutoff(new Date()).toISOString();
    for (const r of rules) {
      const links = autoLinks(r, sessions, visible, results, since);
      if (Object.keys(links).length > 0) applyAutoLinks(r.courseId, links);
    }
  }, [pulled, rules, sessions, visible, results, applyAutoLinks]);

  return null;
}
