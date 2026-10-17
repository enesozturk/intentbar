import type { Answer, Provider } from "../types";

const ENDPOINT = "https://api.openai.com/v1/decisions";

/** The only model `/v1/decisions` serves at the time of writing. */
const MODEL = "gpt-6-luna";

export type DecisionsOptions = {
  /** Defaults to `process.env.OPENAI_API_KEY`. */
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /** Per attempt. Two attempts of 5s keeps the worst case inside what a palette can get away with. */
  timeoutMs?: number;
  /** Retries after the first attempt. Default 1. */
  retries?: number;
  fetch?: typeof fetch;
};

/**
 * OpenAI's Decisions API as an intentbar provider.
 *
 * `POST /v1/decisions` answers typed questions — a choice from a fixed set, a
 * probability for a condition — instead of generating text. That is exactly
 * what intentbar needs: a generated answer could return an id that is not on
 * the list, and the allowlist check would then abstain on an answer that was
 * probably right.
 *
 * Written with `fetch` rather than the `openai` SDK so the package stays
 * dependency-free and small enough to sit in an edge bundle.
 *
 * Note: the Decisions API is in public beta. If its shape changes, this file is
 * the only thing that needs to follow — swap it out via the `provider` option.
 */
export function decisionsProvider(options: DecisionsOptions = {}): Provider {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const retries = options.retries ?? 1;
  const doFetch = options.fetch ?? globalThis.fetch;

  return async (request) => {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "intentbar: no API key. Set OPENAI_API_KEY on the server, or pass apiKey to decisionsProvider().",
      );
    }

    const body = JSON.stringify({ model: options.model ?? MODEL, ...request });
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await doFetch(options.baseUrl ?? ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.ok) return (await response.json()) as { answers: Answer[] };

        // 4xx is our own request being wrong — a bad key, a malformed question —
        // and retrying only doubles the wait before the same failure.
        const retryable = response.status === 429 || response.status >= 500;
        lastError = new Error(`intentbar: Decisions API ${response.status}: ${(await response.text()).slice(0, 200)}`);
        if (!retryable) break;
      } catch (error) {
        // A timeout or a dropped connection, which is worth one more attempt.
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError ?? new Error("intentbar: Decisions API request failed");
  };
}
