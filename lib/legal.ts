// Facts the privacy notice (/adatvedelem) states about the controller and the hosting. Keep them
// true: the notice is a legal statement (GDPR Art. 13), so update them together with the setup.

export const CONTROLLER = {
  /** The person (or organisation) running the service. */
  name: "Bere Nándor",
  /** Address for privacy requests; it is shown on the notice. */
  email: "berenandor@icloud.com",
};

/** Date of the last change to the notice, shown on it (YYYY-MM-DD). */
export const PRIVACY_UPDATED = "2026-10-11";

/** Region of the Upstash Redis database, as the notice names it. */
export const DATABASE_REGION = "az Európai Unió (Frankfurt)";
/** The same, for the English notice. */
export const DATABASE_REGION_EN = "the European Union (Frankfurt)";

/** Hosting provider of the app, named in the service-provider details on /feltetelek. */
export const HOSTING = {
  name: "Vercel Inc.",
  address: "440 N Barranca Avenue #4133, Covina, CA 91723, USA",
  addressEn: "440 N Barranca Avenue #4133, Covina, CA 91723, United States",
  email: "privacy@vercel.com",
  url: "https://vercel.com",
};

/** Date of the last change to the terms of use, shown on them (YYYY-MM-DD). */
export const TERMS_UPDATED = "2026-10-12";

/** Public source code (MIT licence). */
export const SOURCE_URL = "https://github.com/bnandy05/hallgatoui";

/** Minimum age to hold an account. */
export const MINIMUM_AGE = 18;
