// Jev (TypeSafe AI) answers typed questions. Two uses, with different privacy: the requirements
// survey (`systemOne`, lib/rules/extract/survey) sends the whole pasted document and the course
// name in one request; the suggestions (`askJev`, lib/server/jevSuggest.ts) send only their
// question's state (the sentence, the titles or names it is about), never the document or the
// student. Plain fetch, no SDK. Env JEV_API_KEY. A suggestion below the confidence threshold is
// dropped, so the student decides it instead (the plan's "never guess" rule). Server-only.

/** What Jev needs of a question; the extraction's `Question` has this shape too. */
export interface JevQuestion {
  id: string;
  instructions: string; // English
  quote: string; // the state Jev reads
  options: { id: string; criterion: string }[];
}

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
export const JEV_MODEL = "jev-1.13.0";
export const JEV_MIN_CONFIDENCE = 0.8;
export const JEV_MAX_QUESTIONS = 20;
const TIMEOUT_MS = 15_000;

export interface JevAnswer {
  option: string;
  confidence: number;
}

export function isJevConfigured(): boolean {
  return !!process.env.JEV_API_KEY;
}

interface JevResponse {
  answers?: Record<string, { type?: string; choice?: string; confidence?: number }>;
}

/** The request body for one sentence and the questions about it. */
export function jevRequest(quote: string, questions: JevQuestion[]): { body: unknown; keys: Map<string, string> } {
  const keys = new Map<string, string>();
  const qs: Record<string, unknown> = {};
  questions.forEach((q, i) => {
    const key = `q${i}`;
    keys.set(key, q.id);
    qs[key] = {
      type: "choice",
      instructions: q.instructions,
      criteria: Object.fromEntries(q.options.map((o) => [o.id, o.criterion])),
    };
  });
  return { body: { model: JEV_MODEL, state: quote.slice(0, 2000), questions: qs }, keys };
}

/**
 * Asks Jev every question (grouped by state, one request per state, in parallel) and returns
 * every valid answer with its confidence, confident or not. A question whose request failed is
 * missing from the result.
 */
export async function askJevRaw(
  questions: JevQuestion[],
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<Record<string, JevAnswer>> {
  const byState = new Map<string, JevQuestion[]>();
  for (const q of questions.slice(0, JEV_MAX_QUESTIONS)) byState.set(q.quote, [...(byState.get(q.quote) ?? []), q]);
  const out: Record<string, JevAnswer> = {};
  await Promise.all(
    [...byState].map(async ([quote, qs]) => {
      const { body, keys } = jevRequest(quote, qs);
      try {
        const res = await fetchImpl(JEV_URL, {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) {
          console.error(`[jev] ${res.status}`);
          return;
        }
        const data = (await res.json()) as JevResponse;
        for (const [key, id] of keys) {
          const a = data.answers?.[key];
          const q = qs.find((x) => x.id === id)!;
          if (!a?.choice || typeof a.confidence !== "number") continue;
          if (!q.options.some((o) => o.id === a.choice)) continue;
          out[id] = { option: a.choice, confidence: a.confidence };
        }
      } catch (err) {
        console.error("[jev] request failed", err instanceof Error ? err.name : "unknown");
      }
    })
  );
  return out;
}

export const confidentOnly = (answers: Record<string, JevAnswer>): Record<string, JevAnswer> =>
  Object.fromEntries(Object.entries(answers).filter(([, a]) => a.confidence >= JEV_MIN_CONFIDENCE));

/** The confident answers only; failures and doubts are left to the student. */
export async function askJev(
  questions: JevQuestion[],
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<Record<string, JevAnswer>> {
  return confidentOnly(await askJevRaw(questions, apiKey, fetchImpl));
}

const SYSTEM_ONE_TIMEOUT_MS = 30_000;

/**
 * One POST to System One with a ready body; returns its `answers` object, or null on any failure.
 * Logs only the status or the error name, never the request or the answers.
 */
export async function systemOne(body: unknown, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<unknown | null> {
  try {
    const res = await fetchImpl(JEV_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SYSTEM_ONE_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[jev] ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { answers?: unknown };
    return typeof data.answers === "object" && data.answers !== null ? data.answers : null;
  } catch (err) {
    console.error("[jev] request failed", err instanceof Error ? err.name : "unknown");
    return null;
  }
}
