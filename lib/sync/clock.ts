// The clock that timestamps edits. A device clock can be minutes off, and "the later edit wins"
// must not depend on it, so every timestamp is shifted by the offset to the server's clock, learned
// from the `Date` header of the account API responses. No React and no store here (tests import
// it): the store persists the offset and hands it back through `setServerOffset`.

let serverOffsetMs = 0;

export function setServerOffset(ms: number) {
  serverOffsetMs = Number.isFinite(ms) ? ms : 0;
}

/** The current time on the server's clock, as an ISO string. */
export function syncNow(): string {
  return new Date(Date.now() + serverOffsetMs).toISOString();
}

/**
 * Server minus local time for one request, or null without a usable `Date` header. The header is
 * truncated to whole seconds, so half a second is added to centre the error; the local side is the
 * midpoint of the request.
 */
export function offsetFromResponse(dateHeader: string | null, sentAt: number, receivedAt: number): number | null {
  if (!dateHeader) return null;
  const server = new Date(dateHeader).getTime();
  if (!Number.isFinite(server)) return null;
  return server + 500 - (sentAt + receivedAt) / 2;
}
