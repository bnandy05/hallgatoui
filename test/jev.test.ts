import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractRules } from "@/lib/rules/extract";
import { askJev, jevRequest, JEV_MODEL, systemOne } from "@/lib/server/jev";

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

test("systemOne posts the body once and returns the answers object", async () => {
  const body = { model: "m", state: { document: "titkos szöveg" }, questions: {} };
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Response.json({ model: "m", answers: { a: { type: "noul", noul: 0.9 } }, usage: { input_tokens: 1, output_tokens: 1 } });
  }) as unknown as typeof fetch;
  assert.deepEqual(await systemOne(body, "k", fake), { a: { type: "noul", noul: 0.9 } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.typesafe.ai/v1/systemone");
  assert.equal(calls[0].init.method, "POST");
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, "Bearer k");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), body);
  assert.ok(calls[0].init.signal, "a timeout is set");
});

test("systemOne gives null on a failure and logs no text", async () => {
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => void logged.push(a);
  try {
    const body = { state: { document: "titkos szöveg" } };
    const status = (async () => new Response("overloaded titkos szöveg", { status: 529 })) as unknown as typeof fetch;
    assert.equal(await systemOne(body, "k", status), null);
    const thrown = (async () => {
      throw new DOMException("titkos szöveg", "TimeoutError");
    }) as unknown as typeof fetch;
    assert.equal(await systemOne(body, "k", thrown), null);
    const noAnswers = (async () => Response.json({ model: "m" })) as unknown as typeof fetch;
    assert.equal(await systemOne(body, "k", noAnswers), null);
    const notJson = (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch;
    assert.equal(await systemOne(body, "k", notJson), null);
  } finally {
    console.error = original;
  }
  assert.ok(logged.length >= 3);
  assert.ok(!JSON.stringify(logged).includes("titkos"), "only a status or an error name is logged");
  assert.deepEqual(logged[0], ["[jev] 529"]);
  assert.deepEqual(logged[1], ["[jev] request failed", "TimeoutError"]);
});
