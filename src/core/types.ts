/**
 * A place in the app the palette can send someone.
 *
 * `description` and `intents` are the whole product. The model never sees a URL
 * and never writes one: it picks an `id` from this list, and the path is
 * assembled from the matching entry. So the quality of the feature is the
 * quality of these two fields — write what a person wants to DO on the page, in
 * the words (and languages) your users actually type.
 */
export type Destination = {
  /** Stable id. The model answers with this, never with a path. */
  id: string;
  /** App-relative path, prefixed with the scope's path when scopes are used. */
  path: string;
  /** How the row reads in the palette: `["Settings", "Billing"]`. */
  breadcrumb: readonly string[];
  /** One or two sentences on what the page is for. */
  description: string;
  /** Phrases a user might type for it. An exact hit here skips the model entirely. */
  intents: readonly string[];
};

/**
 * A tenant, team, project or account whose name can appear in the typed text
 * ("acme billing"). Omit scopes entirely for a single-tenant app.
 *
 * The server builds this list for the caller. It is never read from the
 * request, so a user cannot name a scope they have no access to.
 */
export type Scope = {
  /** Used in the path: `/${id}${destination.path}` by default. */
  id: string;
  /** Shown in the palette row, and matched against the typed text. */
  name: string;
  /** Anything else the UI wants to render, such as a logo URL. Passed through. */
  meta?: Record<string, unknown>;
};

/** How the answer was reached: straight from the sitemap, or classified by the model. */
export type ResolutionMethod = "exact" | "model";

/**
 * An offer to run the fallback action instead of opening a page — "ask the
 * assistant", "search the docs", "file a ticket".
 *
 * Configured with `fallback`. Without it, text that matches no page resolves to
 * an abstention and the palette shows nothing.
 */
export type FallbackSuggestion = {
  /** Where selecting the row goes, built by the configured `fallback.path`. */
  path: string;
  /** The text the fallback acts on, with any scope name stripped. */
  query: string;
  /** The scope it would run in. */
  scope: ResolvedScope | null;
  /** The model's probability that the text is work for the fallback. */
  probability: number;
};

export type ResolvedScope = Scope & { isCurrent: boolean };

export type Resolution =
  | {
      status: "matched";
      id: string;
      breadcrumb: readonly string[];
      /** The app path to navigate to, assembled here from the sitemap. */
      path: string;
      scope: ResolvedScope | null;
      confidence: number;
      method: ResolutionMethod;
      fallback: FallbackSuggestion | null;
    }
  | {
      status: "abstain";
      confidence: number;
      method: ResolutionMethod;
      /** The way out of an abstain: no page fits, but the fallback may still.  */
      fallback: FallbackSuggestion | null;
    };

/** A `choice` question over a fixed option set. */
export type ChoiceQuestion = {
  type: "choice";
  name: string;
  instructions: string;
  choices: { value: string; description: string }[];
};

/** A yes/no question, answered with a probability rather than a label. */
export type PredicateQuestion = {
  type: "predicate";
  name: string;
  instructions: string;
};

export type Question = ChoiceQuestion | PredicateQuestion;

/**
 * One answer, by question name.
 *
 * A single question can be refused while the others are answered, so this is a
 * union rather than a choice. Choice values are typed — a string and a boolean
 * with the same text are distinct — and every option intentbar offers is a
 * string.
 */
export type Answer =
  | {
      type: "choice";
      name?: string | null;
      choice: string | boolean;
      confidence?: number;
      probabilities?: { value: string | boolean; probability: number }[];
    }
  | { type: "predicate"; name?: string | null; probability: number }
  | { type: "refusal"; name?: string | null };

/**
 * What intentbar needs from a model: typed answers to bounded questions about
 * one text.
 *
 * This is the whole provider surface, so it can be swapped — for another
 * vendor, for a local model, or for a stub in tests. The default is OpenAI's
 * Decisions API, which answers exactly this shape natively.
 */
export type Provider = (request: { input: string; questions: Question[] }) => Promise<{ answers: Answer[] }>;
