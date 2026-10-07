import { useEffect, useRef, useState } from "react";

import type { Resolution } from "../core/types.js";

/** Wait for the user to pause typing before spending a model call. */
const DEFAULT_DEBOUNCE_MS = 400;

/** Shorter text is almost always the start of a command the palette already lists. */
const DEFAULT_MIN_LENGTH = 3;

export type UseIntentbarOptions = {
  /** Where `createHandler` is mounted. Default `/api/intentbar`. */
  endpoint?: string;
  /** The scope the user is currently in, if your app has scopes. */
  scopeId?: string;
  /**
   * Set false to stop asking — pass `false` while the text exactly matches a
   * command your palette already shows, so typing a known command never costs
   * a model call.
   */
  enabled?: boolean;
  debounceMs?: number;
  minLength?: number;
  /** Extra headers, for an auth token the endpoint expects. */
  headers?: Record<string, string>;
};

export type UseIntentbarResult = {
  /** Null until a result for the text currently in the box has arrived. */
  resolution: Resolution | null;
  isResolving: boolean;
  error: string | null;
};

/**
 * Resolves what the user typed into a destination in your app, while they type.
 *
 * Three things keep this from being a request per keystroke: a debounce, a
 * minimum length, and a cache keyed on the exact text. The last one matters
 * more than it looks — backspacing through a phrase would otherwise re-ask for
 * every prefix on the way back.
 *
 * A result is only returned when it belongs to the text currently in the box.
 * Without that, a slow answer for an earlier phrase can land while the user is
 * still typing and quietly become what Enter does.
 */
export function useIntentbar(query: string, options: UseIntentbarOptions = {}): UseIntentbarResult {
  const {
    endpoint = "/api/intentbar",
    scopeId,
    enabled = true,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    minLength = DEFAULT_MIN_LENGTH,
    headers,
  } = options;

  const trimmed = query.trim();
  const isActive = enabled && trimmed.length >= minLength;

  const [settledQuery, setSettledQuery] = useState("");
  const [state, setState] = useState<{ query: string; resolution: Resolution | null; error: string | null }>({
    query: "",
    resolution: null,
    error: null,
  });
  const [isFetching, setIsFetching] = useState(false);

  const cache = useRef(new Map<string, Resolution>());
  const headersRef = useRef(headers);
  headersRef.current = headers;

  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(() => setSettledQuery(trimmed), debounceMs);
    return () => clearTimeout(timer);
  }, [trimmed, isActive, debounceMs]);

  useEffect(() => {
    if (!isActive || settledQuery !== trimmed) return;

    const key = `${scopeId ?? ""}\u0000${settledQuery}`;
    const cached = cache.current.get(key);
    if (cached) {
      setState({ query: settledQuery, resolution: cached, error: null });
      return;
    }

    const controller = new AbortController();
    setIsFetching(true);

    void (async () => {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headersRef.current },
          body: JSON.stringify({ query: settledQuery, scopeId }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Could not resolve that.");

        cache.current.set(key, data as Resolution);
        setState({ query: settledQuery, resolution: data as Resolution, error: null });
      } catch (error) {
        // An aborted request is the user still typing, not a failure.
        if ((error as Error)?.name === "AbortError") return;
        setState({ query: settledQuery, resolution: null, error: (error as Error).message });
      } finally {
        setIsFetching(false);
      }
    })();

    return () => controller.abort();
  }, [settledQuery, trimmed, isActive, scopeId, endpoint]);

  const isCurrent = state.query === trimmed;

  return {
    resolution: isActive && isCurrent ? state.resolution : null,
    isResolving: isActive && (settledQuery !== trimmed || isFetching),
    error: isActive && isCurrent ? state.error : null,
  };
}
