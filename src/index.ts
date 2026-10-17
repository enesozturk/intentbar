export { resolveIntent, findScopeMention, DEFAULT_CONFIDENCE_THRESHOLD, DEFAULT_FALLBACK_THRESHOLD } from "./core/resolve";
export type { FallbackConfig, ResolveOptions } from "./core/resolve";
export { normalizeQuery, MAX_QUERY_LENGTH } from "./core/normalize";
export { decisionsProvider } from "./core/providers/decisions";
export type { DecisionsOptions } from "./core/providers/decisions";
export type {
  Answer,
  ChoiceQuestion,
  Destination,
  FallbackSuggestion,
  PredicateQuestion,
  Provider,
  Question,
  Resolution,
  ResolutionMethod,
  ResolvedScope,
  Scope,
} from "./core/types";

import type { Destination } from "./core/types";

/**
 * Identity function that types your sitemap.
 *
 * Only here so editors complete the fields and a typo in `breadcrumb` is caught
 * where you wrote it rather than at the call site.
 */
export function defineSitemap<T extends readonly Destination[]>(sitemap: T): T {
  return sitemap;
}
