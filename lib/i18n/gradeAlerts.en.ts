// Grade alerts (English). Typed against the Hungarian source, so a missing or extra key fails the build.

import type { Messages } from "./index";

const d = (v: number | string): string => String(v);

export const gradeAlertsEn: Messages["gradeAlerts"] = {
  kinds: {
    opportunity: {
      name: "Better grade in reach",
      description: "A score you can reach on an upcoming assessment would get you a better grade.",
    },
    risk: {
      name: "Grade at risk",
      description: "Your grade or passing is at risk: an unmet condition or a hard-to-reach score.",
    },
    absence: {
      name: "Absence limit",
      description: "Only a few (or no) absences are left.",
    },
    change: {
      name: "Grade changed",
      description: "A recorded result settled a grade or changed it.",
    },
  },
  settings: {
    title: "Grade alerts",
    sub: "A heads-up when a grade may move: a better one is in reach, one is at risk, the absence limit is close, or a recorded result changed it.",
    kind: "Alert",
    bell: "Bell",
    email: "Email",
    sendEmail: "Send emails",
    sendEmailHint: "We send at most one urgent alert a day, plus a “Grades” block in the digest if you get one.",
    sendTo: (address: string) => `Sent to: ${address}`,
    emailOff: "You only get alerts by email once you switch on “Send emails”.",
    emailUnavailable: "Email alerts are not available yet.",
    emailLoading: "Loading…",
    emailError: "The email setting could not be reached right now.",
    switchLabel: (kind: string, channel: string) => `${kind}: ${channel}`,
    emptyTitle: "No course has rules yet",
    emptyText: "Alerts are worked out from each course's requirements. Open a course and set up its requirements.",
    emptyLink: "Open a course",
    emptyLinkNone: "Courses",
  },
  text: {
    opportunityPoints: (label, min, max, goal) => `${d(min)}/${d(max)} on ${label} gets you a ${goal}`,
    opportunityGrade: (label, min, goal) => `A ${min} or better on ${label} gets you a ${goal}`,
    unreachable: (outcome) => `${outcome} can no longer be passed`,
    hardPoints: (label, min, max, pass) => `A ${pass} needs ${d(min)}/${d(max)} on ${label}`,
    hardGrade: (label, min, pass) => `A ${pass} needs at least a ${min} on ${label}`,
    settled: (grade) => `Final: ${grade > 0 ? grade : "no grade"}`,
    secured: (grade) => `A ${grade} is secured`,
    lost: (grade) => `A ${grade} is no longer reachable`,
    outcomePrefix: (outcome, text) => `${outcome}: ${text}`,
  },
};
