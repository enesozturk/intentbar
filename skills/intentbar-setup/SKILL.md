---
name: intentbar-setup
description: Installs and wires up intentbar in this codebase — reads the app's routes, writes the sitemap with real descriptions and intents, mounts the server handler, and connects the hook to the existing command palette. Use when the user asks to set up, install, configure or fix intentbar, or wants natural-language / AI navigation in their command palette.
---

# Installing intentbar

Your job is to leave the user with a working palette row, not with a config file
they still have to fill in. The package ships a resolver; **the sitemap is the
product**, and writing it is the part only someone who can read this codebase
can do.

Work in this order. Do not skip step 1 — a sitemap written from route paths
alone performs badly, and that is the single most common reason this feature
feels broken.

## 1. Learn the app before writing anything

Find the routes and understand what each page is *for*:

- **Next.js App Router**: `app/**/page.tsx`. Dynamic segments (`[id]`) are not
  destinations on their own; a detail page is only worth listing if it can be
  reached without an id.
- **Next.js Pages Router**: `pages/**/*.tsx`, minus `_app`, `_document`, `api/`.
- **React Router / TanStack Router**: the route definition object or the
  `<Route>` tree. Follow `lazy`/`element` imports to the component.
- **Anything else**: ask. Guessing the router produces a sitemap of paths that
  do not exist.

For each candidate, open the component (or its heading, empty state and primary
button) and answer: what does a person come here to DO? That sentence is the
`description`. Do not paraphrase the path.

**Only read-only destinations belong in the sitemap.** No API routes, no
create/delete flows, no checkout, no logout, no anything that acts when opened.
The palette navigates on Enter, sometimes on a near-miss, so a destructive
destination is a footgun. Leave auth pages out too.

Keep it to the 15–40 pages people actually ask for. A sitemap of 200 routes
makes every answer less confident, and costs more per request.

## 2. Write the sitemap

Create `intentbar.sitemap.ts` (or wherever the project keeps constants):

```ts
import { defineSitemap } from "intentbar";

export const sitemap = defineSitemap([
  {
    id: "settings-billing",
    path: "/settings/billing",
    breadcrumb: ["Settings", "Billing"],
    description: "Invoices, the current plan, and the payment method on file.",
    intents: ["billing", "invoices", "change my plan", "faturalar", "plan değiştir"],
  },
]);
```

Rules that decide whether this works:

- `description` says what the user DOES there, in their words, not the
  component's name. "Invite teammates and change their roles" beats "Members
  table".
- `intents` are the phrasings people actually type, **including every language
  your users use**. This is what makes the exact-match path (no model call,
  instant, free) hit. Add the obvious typo-free phrasings; the model handles
  typos itself.
- `breadcrumb` is what the palette row shows. Match the app's own navigation
  labels, so the row looks like somewhere the user has been.
- Give adjacent pages *distinct* descriptions. "Google Ads" and "Google Ads
  report" that read alike will split probability and abstain — the most
  confusing failure mode, because both answers were nearly right.

## 3. Mount the handler

The API key must stay on the server, so there is exactly one endpoint to add.
Match the project's framework:

```ts
// Next.js App Router — app/api/intentbar/route.ts
import { createHandler } from "intentbar/server";

import { sitemap } from "@/intentbar.sitemap";

export const POST = createHandler({
  sitemap,
  appContext: "<one sentence: what this app is, so the model knows what it is routing inside>",
  // Required in any app with a login. Without it this endpoint is open to
  // anyone who can reach it, and it spends the API budget.
  authorize: async (request) => Boolean(await getSession(request)),
});
```

Use the project's existing auth helper — find it, do not invent one. If the
codebase wraps route handlers (error capture, rate limiting, logging), wrap this
one the same way; follow the convention already in the repo.

If the app is multi-tenant (workspaces, teams, orgs, projects in the URL), add
`getScopes`. **Read it from the session, never from the request body** — it is
the list of places the user is allowed to be sent, and the whole safety property
depends on the server owning it:

```ts
getScopes: async (request) => {
  const user = await getSession(request);
  return (await listUserWorkspaces(user.id)).map((ws) => ({
    id: ws.slug,
    name: ws.name,
    meta: { logoUrl: ws.logoUrl },
  }));
},
```

For a server without Web-standard `Request`/`Response` (Express, older Node),
adapt at the edge — `createHandler` returns `(Request) => Promise<Response>`
and nothing else.

## 4. Set the key

Add `OPENAI_API_KEY` to the server environment: `.env.local` for local work,
plus wherever production secrets live (check for a deploy workflow, a
`wrangler.jsonc`, a Dockerfile, a Vercel/Netlify config — and tell the user
exactly which one still needs it). Never add it to a `NEXT_PUBLIC_*` variable or
any client-visible config; that key would be in the bundle.

If the project already has `OPENAI_API_KEY`, reuse it. Say so rather than adding
a second one.

## 5. Wire the palette

Find the existing palette — `cmdk`, a Radix dialog, a custom one — and add rows
to it. Do not build a new palette; match what is there, including its row
markup, icon sizing and selected-row styling.

```tsx
const { resolution, isResolving, error } = useIntentbar(search, {
  scopeId: currentWorkspaceSlug, // omit in a single-tenant app
  // Typing a command the palette already lists must not cost a model call.
  enabled: !isExistingCommand,
});

const match = resolution?.status === "matched" ? resolution : null;
```

Then:

- Render the match as the first group, and **auto-focus it** so Enter navigates.
  If the palette is a `cmdk` list with a custom `filter`, give these rows a value
  prefix and return `1` for it, or the filter will hide them (they do not
  contain the typed text).
- Show the three states: resolving, no match, and lookup failed. Silence on
  failure makes the feature look dead.
- Navigate with the app's own router to `match.path`. It is already a complete
  in-app path; do not prefix it again.
- If a scope came back with `isCurrent: false`, say so in the row ("Switch to
  Acme"), using `resolution.scope.meta` for the logo. Moving someone between
  tenants without telling them is disorienting.

## 6. The fallback row (optional, but this is the good part)

If the app has an assistant, a chat, or a search page that accepts a query,
configure `fallback`. Text like "how are my ads performing" is not a
destination, and without this the palette answers it with "no matching page".

```ts
fallback: {
  path: (query, scope) => `/${scope?.id ?? ""}/chat?prompt=${encodeURIComponent(query)}`,
},
```

Check how the target page accepts a prefilled query **before** writing this —
many already support a `?prompt=`/`?q=` param for deep links, and reusing it
means no change on that side. If it does not, that is a separate change the user
should agree to.

In the UI, when `resolution.fallback` is set, give it its own row and let it take
Enter: the user wrote a question, not a destination. Hide the page row if it
points at that same page — with the query prefilled, opening it empty is a worse
version of the same row.

A confident page match and a strong fallback often both appear, because both
answers are right ("how did last week go" matches a Dashboard at 0.93 and scores
1.00 as a question). Show the question first and the page below it, and say so
to the user — it is a product decision they may want inverted if their pages
answer questions better than their assistant does.

## 7. Verify against the real API, then show the numbers

Do not hand this over on "it compiles". Write a throwaway script that calls
`resolveIntent` with the real provider for 10–15 phrases the user's customers
would type — in every language they use — and print the chosen id and
confidence:

```ts
const result = await resolveIntent(phrase, { sitemap, provider: decisionsProvider() });
```

Include cases that *should* abstain (off-topic text, gibberish). Then report the
hit rate and anything that surprised you. Two failures worth knowing how to
read:

- **A phrase lands just under the threshold** — usually a description that does
  not contain the words users type. Fix the sitemap entry, not the threshold.
- **Two sibling pages split the probability** (0.47/0.46) and it abstains. Their
  descriptions overlap. Make them distinct, or accept the abstain: on a genuine
  coin flip, abstaining beats guessing.

Tell the user the measured numbers and the per-request cost, not a claim that it
works.
