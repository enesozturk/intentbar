import { decisionsProvider } from "../core/providers/decisions.js";
import { resolveIntent, type FallbackConfig } from "../core/resolve.js";
import { MAX_QUERY_LENGTH } from "../core/normalize.js";
import type { Destination, Provider, Resolution, Scope } from "../core/types.js";

export type HandlerConfig = {
  sitemap: readonly Destination[];
  /** Defaults to the Decisions API provider, reading `OPENAI_API_KEY`. */
  provider?: Provider;
  /**
   * The caller's scopes, from the session.
   *
   * This is the security boundary: whatever you return here is the complete set
   * of scopes the user can be sent to, no matter what they type. Read it from
   * your own auth, never from the request body.
   */
  getScopes?: (request: Request) => Promise<readonly Scope[]> | readonly Scope[];
  /**
   * Reject the request before any model call. Return false (or throw) for a
   * signed-out caller. Without it, the endpoint is open to anyone who can
   * reach it — and it spends your API budget.
   */
  authorize?: (request: Request) => Promise<boolean> | boolean;
  appContext?: string;
  confidenceThreshold?: number;
  fallback?: FallbackConfig;
  scopedPath?: (scope: Scope & { isCurrent: boolean }, path: string) => string;
  /** Called when resolving throws, so failures reach your monitoring instead of only the user. */
  onError?: (error: unknown, request: Request) => void;
};

type Body = { query?: unknown; scopeId?: unknown };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/**
 * The server half of intentbar: one POST endpoint the React hook calls.
 *
 * A model API key cannot live in a browser bundle, so the classification has to
 * happen somewhere the key is secret. This handler is that place, and it is
 * deliberately the only thing intentbar asks you to wire up.
 *
 * It returns a Web-standard `Response`, so it works as a Next.js route handler,
 * a Hono or Elysia route, a Cloudflare Worker, a Deno or Bun server, or
 * anything else speaking `Request` in and `Response` out.
 *
 * ```ts
 * // app/api/intentbar/route.ts
 * export const POST = createHandler({ sitemap, authorize: (req) => hasSession(req) });
 * ```
 */
export function createHandler(config: HandlerConfig): (request: Request) => Promise<Response> {
  const provider = config.provider ?? decisionsProvider();

  return async function handle(request: Request): Promise<Response> {
    try {
      if (config.authorize) {
        const allowed = await config.authorize(request);
        if (!allowed) return json({ error: "Unauthorized" }, 401);
      }

      const body = (await request.json().catch(() => null)) as Body | null;
      if (typeof body?.query !== "string" || !body.query.trim()) {
        return json({ error: "Send a query." }, 400);
      }

      const scopes = config.getScopes ? await config.getScopes(request) : undefined;

      const resolution: Resolution = await resolveIntent(body.query.slice(0, MAX_QUERY_LENGTH), {
        sitemap: config.sitemap,
        scopes,
        currentScopeId: typeof body.scopeId === "string" ? body.scopeId : undefined,
        provider,
        appContext: config.appContext,
        confidenceThreshold: config.confidenceThreshold,
        fallback: config.fallback,
        scopedPath: config.scopedPath,
      });

      return json(resolution);
    } catch (error) {
      config.onError?.(error, request);
      // The message is not returned: it can carry provider detail, and the UI
      // only needs to know the lookup failed.
      return json({ error: "Could not resolve that." }, 502);
    }
  };
}
