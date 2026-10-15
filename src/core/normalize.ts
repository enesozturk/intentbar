/** Longer than this is not someone naming a destination. */
export const MAX_QUERY_LENGTH = 200;

/**
 * Normalizes typed text, or returns null if it must not reach the model.
 *
 * Control characters, backslashes and encoded traversal are rejected rather
 * than stripped: none of them occur in a genuine "where do I go" phrase, and
 * rejecting is the behaviour you can reason about later. Unicode is preserved,
 * so "cómo está mi cuenta" survives intact.
 */
export function normalizeQuery(input: string): string | null {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > MAX_QUERY_LENGTH) return null;
  if (
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f\u007f\\]/.test(trimmed) ||
    /%(?:2e|2f|5c)/i.test(trimmed) ||
    /(?:^|\/)\.\.(?:\/|$)/.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

/** Case- and whitespace-insensitive key for exact phrase matching. Keeps Unicode. */
export function phraseKey(value: string): string {
  return value.toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
}

/** Words of a string, lowercased, punctuation dropped. */
export function words(value: string): string[] {
  return value
    .toLocaleLowerCase("en")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}
