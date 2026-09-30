import ICAL from "ical.js";
import type { IcalEventDTO } from "@/lib/ical/types";

/**
 * Parses raw iCalendar (.ics) text into a flat list of event DTOs.
 * Pure function: no network access, no store access.
 */
export function parseIcs(text: string): IcalEventDTO[] {
  const jcal = ICAL.parse(text);
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents("vevent");

  const events: IcalEventDTO[] = [];
  const seenUids = new Set<string>();

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    const startDate = event.startDate;
    // Skip VEVENTs without a DTSTART; ICAL.Event returns null in that case.
    if (!startDate) continue;

    let start: string;
    if (startDate.isDate) {
      // All-day event: student deadlines treat "all day" as end of day, 23:59 local.
      const jsDate = startDate.toJSDate();
      jsDate.setHours(23, 59, 0, 0);
      start = jsDate.toISOString();
    } else {
      start = startDate.toJSDate().toISOString();
    }

    const summary = event.summary || "(névtelen)";
    // Recurrence overrides share their master's UID; qualify them so every
    // event has a unique key, and drop exact duplicates.
    const baseUid = event.uid || `${summary}|${start}`;
    const recurrenceId = vevent.getFirstPropertyValue("recurrence-id");
    const uid = recurrenceId ? `${baseUid}|${String(recurrenceId)}` : baseUid;
    if (seenUids.has(uid)) continue;
    seenUids.add(uid);

    const urlValue = vevent.getFirstPropertyValue("url");
    const url = typeof urlValue === "string" && urlValue ? urlValue : undefined;

    const categories = vevent
      .getAllProperties("categories")
      .flatMap((property) => property.getValues().map(String));

    events.push({
      uid,
      summary,
      start,
      url,
      description: event.description || undefined,
      categories,
    });
  }

  return events;
}
