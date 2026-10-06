import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractRules } from "@/lib/rules/extract";
import { askJev, jevRequest, JEV_MODEL } from "@/lib/server/jev";

const dotnet = readFileSync("fixtures/kovetelmeny/dotnet/source.txt", "utf8");

test("a Jev request carries one sentence and typed choice questions", () => {
  const q = extractRules(dotnet).questions.find((x) => x.id === "onfail:zhk")!;
  const { body, keys } = jevRequest(q.quote, [q]);
  assert.deepEqual(keys, new Map([["q0", "onfail:zhk"]]));
  assert.deepEqual(body, {
    model: JEV_MODEL,
    state: "Minden zh-nak legalább elégségesnek kell lennie.",
    questions: {
      q0: {
        type: "choice",
        instructions: q.instructions,
        criteria: Object.fromEntries(q.options.map((o) => [o.id, o.criterion])),
      },
    },
  });
});

test("only confident, valid answers are kept; failures leave the question to the student", async () => {
  const questions = extractRules(dotnet).questions; // mode:gyjav, mode:elmjav, onfail:zhk (3 sentences)
  const sent: unknown[] = [];
  const fake = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    sent.push(body);
    assert.equal((init.headers as Record<string, string>).authorization, "Bearer k");
    if (/javítható/.test(body.state)) {
      // one sentence, two questions: one confident, one not
      return Response.json({
        answers: {
          q0: { type: "choice", choice: "replace", confidence: 0.91 },
          q1: { type: "choice", choice: "ifBetter", confidence: 0.4 },
        },
      });
    }
    return new Response("overloaded", { status: 529 });
  }) as typeof fetch;
  const answers = await askJev(questions, "k", fake);
  assert.equal(sent.length, 2);
  assert.deepEqual(answers, { "mode:gyjav": { option: "replace", confidence: 0.91 } });
});

test("an option Jev invents is ignored", async () => {
  const q = extractRules(dotnet).questions.filter((x) => x.id === "onfail:zhk");
  const fake = (async () => Response.json({ answers: { q0: { choice: "maybe", confidence: 0.99 } } })) as unknown as typeof fetch;
  assert.deepEqual(await askJev(q, "k", fake), {});
});
