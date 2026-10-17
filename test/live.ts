/**
 * Manual check against the real Decisions API — not part of `npm test`.
 *
 *   OPENAI_API_KEY=... npx tsx test/live.ts
 *
 * The unit tests stub the model, so they prove the allowlists hold but say
 * nothing about whether the model picks the right page. This is the loop the
 * setup skill tells users to run on their own sitemap.
 */
import { decisionsProvider, defineSitemap, resolveIntent } from "../src/index";

const sitemap = defineSitemap([
  {
    id: "settings-billing",
    path: "/settings/billing",
    breadcrumb: ["Settings", "Billing"],
    description: "Invoices, the current plan, and the payment method on file.",
    intents: ["billing", "invoices", "change my plan", "payment method"],
  },
  {
    id: "members",
    path: "/settings/members",
    breadcrumb: ["Settings", "Members"],
    description: "Invite teammates, remove them, and change their roles.",
    intents: ["add member", "invite someone", "team"],
  },
  {
    id: "profile",
    path: "/settings/profile",
    breadcrumb: ["Settings", "Profile"],
    description: "Your own name, email, password and notification preferences.",
    intents: ["profile", "change password", "notifications"],
  },
  {
    id: "dashboard",
    path: "/dashboard",
    breadcrumb: ["Dashboard"],
    description: "Overview of revenue, orders and traffic for the last weeks.",
    intents: ["dashboard", "overview"],
  },
  {
    id: "orders",
    path: "/orders",
    breadcrumb: ["Orders"],
    description: "Every order, its status, and refunds for individual orders.",
    intents: ["orders", "refund an order"],
  },
  {
    id: "products",
    path: "/products",
    breadcrumb: ["Products"],
    description: "The product catalogue: prices, stock levels and variants.",
    intents: ["products", "stock", "update a price"],
  },
  {
    id: "assistant",
    path: "/assistant",
    breadcrumb: ["Assistant"],
    description: "Chat with the AI assistant about your store's numbers.",
    intents: ["assistant", "chat", "ask ai"],
  },
]);

const scopes = [
  { id: "northwind", name: "Northwind" },
  { id: "acme", name: "Acme Inc." },
];

/** Typed text, and the id a human would expect — "fallback", or null to show nothing. */
const CASES: [string, string | null][] = [
  ["invoices", "settings-billing"],
  // The sitemap is English-only: these prove the model still reads a query
  // written in another language.
  ["cómo agrego a alguien al equipo", "members"],
  ["where do I change my password", "profile"],
  ["acme niveles de stock", "products"],
  ["refund an order", "orders"],
  // Genuinely both: the dashboard matches at 0.73 AND the fallback at 0.98.
  // The UI shows the question first and the page below it, so "fallback" is what
  // Enter does — see "When both are present" in the README.
  ["how did last week go", "fallback"],
  ["why did my revenue drop last week", "fallback"],
  ["which product sells best", "fallback"],
  ["what's the weather in Istanbul", null],
  ["asdfgh qwerty", null],
];

async function main() {
  const provider = decisionsProvider();
  let correct = 0;
  const rows: string[] = [];

  for (const [query, expected] of CASES) {
    const started = Date.now();
    let result: Awaited<ReturnType<typeof resolveIntent>>;
    try {
      result = await resolveIntent(query, {
        sitemap,
        scopes,
        currentScopeId: "northwind",
        provider,
        appContext: "An e-commerce admin panel for a store owner.",
        fallback: {
          path: (text, scope) => `/${scope?.id}/assistant?prompt=${encodeURIComponent(text)}`,
        },
      });
    } catch (error) {
      rows.push(`ERR  ${query.padEnd(32)} ${(error as Error).message.split("\n")[0]}`);
      continue;
    }
    const ms = Date.now() - started;

    // A fallback offer outranks a page match in the UI, so it is what the user
    // would act on with Enter.
    const got = result.fallback ? "fallback" : result.status === "matched" ? result.id : null;
    const ok = got === expected;
    if (ok) correct += 1;

    const path = result.fallback?.path ?? (result.status === "matched" ? result.path : "—");
    rows.push(
      `${ok ? "ok  " : "FAIL"} ${query.padEnd(32)} → ${String(got).padEnd(17)} ${path.padEnd(52)} ` +
        `conf ${result.confidence.toFixed(2)} fb ${(result.fallback?.probability ?? 0).toFixed(2)} ` +
        `${result.method.padEnd(5)} ${ms}ms` +
        (ok ? "" : `   expected ${expected}`),
    );
  }

  console.log(rows.join("\n"));
  console.log(`\n${correct}/${CASES.length} as expected`);
}

void main();
