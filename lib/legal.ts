// Facts the privacy notice (/adatvedelem) states about the controller and the hosting. Keep them
// true: the notice is a legal statement (GDPR Art. 13), so update them together with the setup.

export const CONTROLLER = {
  /** The person (or organisation) running the service. */
  name: "Bere Nándor",
  /** Address for privacy requests; it is shown on the notice. */
  email: "berenandor@icloud.com",
};

/** Date of the last change to the notice, shown on it (YYYY-MM-DD). */
export const PRIVACY_UPDATED = "2026-10-22";

/** How long the keys of already-sent grade-alert emails are kept, in days (SENT_KEEP_DAYS in lib/server/gradeAlerts.ts, which imports this). */
export const GRADE_ALERT_SENT_DAYS = 30;

/** Region of the Upstash Redis database, as the notice names it. */
export const DATABASE_REGION = "az Európai Unió (Frankfurt)";
/** The same, for the English notice. */
export const DATABASE_REGION_EN = "the European Union (Frankfurt)";

/** The AI processor of the requirement tracker (reading requirements, suggestions). */
export const JEV_PROCESSOR = "TypeSafe AI (Jev)";
/** How long Jev's answers are cached, in days (CACHE_TTL_SECONDS in app/api/kovetelmeny/elemzes and lib/server/jevSuggest.ts). */
export const JEV_CACHE_DAYS = 30;
/** How long the per-account request counters for Jev live, in hours (rl:kov:*, rl:jev:d:*). */
export const JEV_COUNTER_HOURS = 24;
/** The longest part of a pasted requirements text sent to Jev in one request (SURVEY_MAX_DOC_CHARS in lib/rules/extract/survey/questions.ts; a test keeps them equal). */
export const JEV_MAX_TEXT_CHARS = 40_000;

/** Where Vercel runs the server functions (vercel.json "regions": fra1). Must match the setup. */
export const FUNCTIONS_REGION = "Frankfurtban (EU)";
export const FUNCTIONS_REGION_EN = "Frankfurt (EU)";
/** How long Vercel keeps the request (runtime) logs, in hours (Hobby plan). Must match the plan. */
export const VERCEL_LOG_HOURS = 1;
/** Where Resend sends the emails from. Must match the Resend domain's region. */
export const RESEND_SENDING_REGION = "az EU-ból (Írország)";
export const RESEND_SENDING_REGION_EN = "the EU (Ireland)";
/** How long Resend keeps delivery data and logs, in days. Must match the Resend plan. */
export const RESEND_RETENTION_DAYS = 30;

/** Hosting provider of the app, named in the service-provider details on /feltetelek. */
export const HOSTING = {
  name: "Vercel Inc.",
  address: "440 N Barranca Avenue #4133, Covina, CA 91723, USA",
  addressEn: "440 N Barranca Avenue #4133, Covina, CA 91723, United States",
  email: "privacy@vercel.com",
  url: "https://vercel.com",
};

/** Date of the last change to the terms of use, shown on them (YYYY-MM-DD). */
export const TERMS_UPDATED = "2026-10-21";

/** Public source code (MIT licence). */
export const SOURCE_URL = "https://github.com/bnandy05/hallgatoui";

/** Minimum age to hold an account. */
export const MINIMUM_AGE = 18;
