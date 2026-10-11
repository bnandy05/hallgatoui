// Errors of fetching and parsing a calendar feed. The message is Hungarian (the original text,
// kept for logs and tests); callers localize with the `code` at the boundary (see errors.ical_*
// in the dictionaries). Pure.

export type IcalErrorCode = "bad_url" | "blocked" | "unreachable" | "http" | "too_large" | "format" | "redirects";

export const ICAL_MESSAGES_HU: Record<IcalErrorCode, string> = {
  bad_url: "Hiányzó vagy hibás URL",
  blocked: "Nem engedélyezett cím",
  unreachable: "A naptár nem érhető el",
  http: "A naptár nem tölthető le",
  too_large: "Túl nagy naptárfájl",
  format: "Hibás iCal formátum",
  redirects: "Túl sok átirányítás",
};

export class IcalError extends Error {
  readonly code: IcalErrorCode;
  /** HTTP status of the feed, for code "http". */
  readonly status?: number;
  constructor(code: IcalErrorCode, status?: number) {
    super(code === "http" && status ? `${ICAL_MESSAGES_HU.http} (HTTP ${status})` : ICAL_MESSAGES_HU[code]);
    this.name = "IcalError";
    this.code = code;
    this.status = status;
  }
}
