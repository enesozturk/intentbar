/**
 * The provider's retry policy and its failure messages.
 *
 * A transient gateway error should cost a second, not the feature; our own bad
 * request should not be sent twice.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decisionsProvider } from "../src/index.js";

const REQUEST = { input: "x", questions: [] };
const ok = () => new Response(JSON.stringify({ answers: [] }), { status: 200 });

test("a 5xx is retried once", async () => {
  let calls = 0;
  const provider = decisionsProvider({
    apiKey: "k",
    fetch: (async () => {
      calls += 1;
      return calls === 1 ? new Response("<html>gateway</html>", { status: 504 }) : ok();
    }) as typeof fetch,
  });

  assert.deepEqual(await provider(REQUEST), { answers: [] });
  assert.equal(calls, 2);
});

test("a 4xx is not retried", async () => {
  let calls = 0;
  const provider = decisionsProvider({
    apiKey: "k",
    fetch: (async () => {
      calls += 1;
      return new Response("bad key", { status: 401 });
    }) as typeof fetch,
  });

  await assert.rejects(() => provider(REQUEST), /Decisions API 401/);
  assert.equal(calls, 1);
});

test("a dropped connection is retried, and the last error surfaces", async () => {
  let calls = 0;
  const provider = decisionsProvider({
    apiKey: "k",
    fetch: (async () => {
      calls += 1;
      throw new Error("socket hang up");
    }) as typeof fetch,
  });

  await assert.rejects(() => provider(REQUEST), /socket hang up/);
  assert.equal(calls, 2);
});

test("retries are configurable", async () => {
  let calls = 0;
  const provider = decisionsProvider({
    apiKey: "k",
    retries: 0,
    fetch: (async () => {
      calls += 1;
      return new Response("nope", { status: 500 });
    }) as typeof fetch,
  });

  await assert.rejects(() => provider(REQUEST));
  assert.equal(calls, 1);
});

// The most common setup mistake, so it gets a message that says what to do
// rather than a 401 from the vendor.
test("a missing key fails with instructions, before any request", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  let calls = 0;

  try {
    const provider = decisionsProvider({
      fetch: (async () => {
        calls += 1;
        return ok();
      }) as typeof fetch,
    });
    await assert.rejects(() => provider(REQUEST), /no API key.*OPENAI_API_KEY/s);
    assert.equal(calls, 0);
  } finally {
    if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
  }
});

test("the request carries the model and the questions", async () => {
  let body: unknown;
  const provider = decisionsProvider({
    apiKey: "k",
    model: "gpt-6-luna",
    fetch: (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return ok();
    }) as unknown as typeof fetch,
  });

  await provider({ input: "hello", questions: [{ type: "predicate", name: "p", instructions: "?" }] });
  assert.deepEqual(body, {
    model: "gpt-6-luna",
    input: "hello",
    questions: [{ type: "predicate", name: "p", instructions: "?" }],
  });
});
