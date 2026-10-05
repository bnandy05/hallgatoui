// Facts the privacy notice (/adatvedelem) states about the controller and the hosting. Keep them
// true: the notice is a legal statement (GDPR Art. 13), so update them together with the setup.

export const CONTROLLER = {
  /** The person (or organisation) running the service. */
  name: "[ADATKEZELŐ NEVE]",
  /** Address for privacy requests; it is shown on the notice. */
  email: "[ADATVÉDELMI E-MAIL-CÍM]",
};

/** Date of the last change to the notice, shown on it (YYYY-MM-DD). */
export const PRIVACY_UPDATED = "2026-10-05";

/** Region of the Upstash Redis database, as the notice names it. */
export const DATABASE_REGION = "az Európai Unió (Frankfurt)";
