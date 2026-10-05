import type { Question } from "@/lib/rules/extract";

// Jev (TypeSafe AI) answers the extraction's multiple-choice questions. It only ever sees the
// sentence a question is about, never the whole document, the course or the student. Plain fetch,
// no SDK. Env JEV_API_KEY. An answer below the confidence threshold is dropped, so the student
// decides it instead (the plan's "never guess" rule). Server-only.

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
export function jevRequest(quote: string, questions: Question[]): { body: unknown; keys: Map<string, string> } {
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
 * Asks Jev every question (grouped by sentence, one request per sentence, in parallel) and
 * returns the confident answers. Failures are swallowed: a missing answer means the student picks.
 */
export async function askJev(
  questions: Question[],
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<Record<string, JevAnswer>> {
  const bySentence = new Map<string, Question[]>();
  for (const q of questions.slice(0, JEV_MAX_QUESTIONS)) bySentence.set(q.quote, [...(bySentence.get(q.quote) ?? []), q]);
  const out: Record<string, JevAnswer> = {};
  await Promise.all(
    [...bySentence].map(async ([quote, qs]) => {
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
          if (a.confidence < JEV_MIN_CONFIDENCE) continue;
          out[id] = { option: a.choice, confidence: a.confidence };
        }
      } catch (err) {
        console.error("[jev] request failed", err instanceof Error ? err.name : "unknown");
      }
    })
  );
  return out;
}
