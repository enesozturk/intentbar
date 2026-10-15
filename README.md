# intentbar

Natural-language navigation for your command palette. The user types where they
want to go — in any language, with typos — and lands on the right page.

```
⌘K  how do i add someone to the team
    ───────────────────────────────────────────
    Go to
    ✦ Settings › Members                     ↵
```

The model never writes a URL. It picks an **id from your own route list**, and
the path is assembled server-side from that list. An answer that is not on the
list is an abstention, not a redirect.

- **Zero dependencies.** One `fetch` call; React is an optional peer.
- **Typed answers, not generated text.** Built on [OpenAI's Decisions
  API](https://developers.openai.com/api/docs/guides/decisions) (`choice` and
  `predicate` questions), so a malformed or invented answer is not a shape the
  model can return. Swap the provider if you want a different one.
- **Free and instant for known phrases.** An exact hit in your `intents` list
  skips the model entirely.
- **Multi-tenant aware.** "acme billing" opens Billing in Acme — and only if the
  session says that user belongs to Acme.

## Install

```bash
npm i intentbar
```

Then, in Claude Code or any agent that reads skills:

```
/intentbar-setup
```

The skill reads your router, writes the sitemap with real descriptions and
phrasings, mounts the handler, wires your existing palette and verifies the
result against the live API. That is the recommended path, because the sitemap
is the part that decides whether this works and it has to be written from your
codebase, not from a template.

To do it by hand, the three pieces are below.

## 1. The sitemap

This is the whole product. `description` and `intents` are what the model
reasons over, so write what a person comes to the page to **do**, in the words
your users actually type.

```ts
// intentbar.sitemap.ts
import { defineSitemap } from "intentbar";

export const sitemap = defineSitemap([
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
    description: "Invite teammates and change their roles.",
    intents: ["add member", "invite someone", "team"],
  },
]);
```

Only read-only destinations belong here. The palette navigates on Enter,
sometimes on a near-miss, so nothing that acts when opened — no delete flows, no
checkout, no logout.

## 2. The endpoint

A model API key cannot live in a browser bundle, so classification happens on
the server. `createHandler` returns a Web-standard `(Request) => Response`,
which works as a Next.js route handler, a Hono route, a Worker, Bun, Deno.

```ts
// app/api/intentbar/route.ts
import { createHandler } from "intentbar/server";

import { sitemap } from "@/intentbar.sitemap";

export const POST = createHandler({
  sitemap,
  appContext: "An ad-management app for marketing teams.",
  authorize: async (request) => Boolean(await getSession(request)),
});
```

Set `OPENAI_API_KEY` in the server environment. Not `NEXT_PUBLIC_*`, not
anything the client can read.

**`authorize` is not optional in practice.** Without it the endpoint is open to
anyone who can reach it, and every request spends your API budget.

## 3a. The palette, if you do not have one

`templates/command-palette.tsx` ships with the package: a full ⌘K palette built
on **shadcn/ui's current `command` and `dialog`** components. The setup skill
copies it into your project — shadcn-style, so it is yours to restyle — after
checking you have Tailwind and shadcn, and adding `command`/`dialog` if they are
missing.

```tsx
<CommandPalette
  open={open}
  onOpenChange={setOpen}
  onNavigate={(path) => router.push(path)}
  commands={[{ id: "settings", label: "Settings", perform: () => router.push("/settings") }]}
/>
```

It binds ⌘K, renders the resolved page, the Ask row, and the resolving/empty/
error states, and composes `Dialog` + `Command` directly — shadcn's
`CommandDialog` cannot forward the controlled `value` and custom `filter` the
resolved rows need.

No Tailwind? Use the hook below against your own UI.

## 3b. The palette row, if you already have a palette

```tsx
import { useIntentbar } from "intentbar/react";

function Palette({ search }: { search: string }) {
  const { resolution, isResolving, error } = useIntentbar(search, {
    // Typing a command you already list must not cost a model call.
    enabled: !isExistingCommand(search),
  });

  const match = resolution?.status === "matched" ? resolution : null;

  if (isResolving) return <Row disabled>Finding the right page…</Row>;
  if (error) return <Row disabled>Couldn’t look that up.</Row>;
  if (!match) return <Row disabled>No matching page found.</Row>;

  return (
    <Row onSelect={() => router.push(match.path)} autoFocus>
      {match.breadcrumb.join(" › ")}
    </Row>
  );
}
```

The hook debounces (400ms), requires 3+ characters, caches per exact phrase, and
only returns a result that belongs to the text currently in the box — so a slow
answer for an earlier phrase can never become what Enter does.

> If your palette is `cmdk` with a custom `filter`, return `1` for these rows.
> They do not contain the typed text, so the default filter hides them.

## Multi-tenant apps

Pass the caller's scopes from the **session**. This list is the complete set of
places a user can be sent, whatever they type.

```ts
export const POST = createHandler({
  sitemap,
  getScopes: async (request) => {
    const user = await getSession(request);
    return (await listWorkspaces(user.id)).map((ws) => ({
      id: ws.slug,
      name: ws.name,
      meta: { logoUrl: ws.logoUrl },
    }));
  },
});
```

```tsx
const { resolution } = useIntentbar(search, { scopeId: currentSlug });
// resolution.scope → { id, name, meta, isCurrent }
```

Naming a scope is handled in code, not by the model: it is more reliable, one
question cheaper, and it sharpens the destination answer. (Measured: the full
phrase "acme dashbard" scored 0.70 for the dashboard page, while "dashbard"
alone scored 0.97 — "acme" leaks probability onto workspace-ish pages.)

## The fallback row

Some text is not a destination. "How are my ads performing" is a question, and
answering it with "no matching page found" is a dead end.

```ts
export const POST = createHandler({
  sitemap,
  fallback: {
    path: (query, scope) => `/${scope?.id}/chat?prompt=${encodeURIComponent(query)}`,
  },
});
```

A `predicate` question rides along in the same request — no extra round trip —
and `resolution.fallback` is set when the text reads as work for it. It
separates cleanly in practice:

| prompt-like | | destination-like | |
| --- | --- | --- | --- |
| `how are my ads performing` | 0.94 | `billing settings` | 0.00 |
| `why did my cpa go up last week` | 1.00 | `add workspace member` | 0.00 |
| `which product sells best` | 0.97 | `show me the tasks board` | 0.00 |

Give it its own row and let it take Enter: the user wrote a question, not a
destination. Override `fallback.instructions` to point it at a docs search, a
ticket form, or anything else.

### When both are present

A confident page match and a strong fallback are not exclusive. "How did last
week go" matches a Dashboard page at 0.73 — just over the threshold — *and*
scores 0.98 as a question,
because both answers are right. intentbar returns both, with their numbers, and
does not pick for you.

The default we recommend, and ship in the examples: **show the question row
first and the page below it.** Someone who phrased a question is more often
after the answer than after the page that contains it, and the page is still one
arrow key away. If your pages answer questions better than your assistant does,
invert it — `resolution.confidence` and `resolution.fallback.probability` are
both there to compare.

One case is not a judgement call: if the matched page *is* the fallback's target
(an assistant page, when the fallback opens the assistant), show only the
fallback row. With the query prefilled, opening that page empty is a worse
version of the same row.

## What it costs

One request per settled phrase, typically **0.2–0.5s**. Input only — the
Decisions API charges no output tokens, and there is no caching discount, so
every lookup bills the whole sitemap.

Measured: **$0.11 per 1,000 lookups** for 25 lean destinations, **$0.18** for 25
real ones with two-language intents and both optional questions. A storefront
with a million monthly users, where only navigational text reaches intentbar,
lands in single-digit dollars a month.

Exact `intents` hits cost nothing and skip the network entirely, so the two
levers are a short sitemap and a well-filled intents list. Both are in the
`intentbar-setup` skill as defaults.

## Configuration

| Option | Default | |
| --- | --- | --- |
| `confidenceThreshold` | `0.72` | Below this it abstains. Raise if users complain about wrong jumps; lower if the palette feels deaf. |
| `fallback.threshold` | `0.6` | The predicate separates sharply, so this rarely needs tuning. |
| `provider` | Decisions API | Any `(request) => Promise<{ answers }>`. |
| `scopedPath` | `/${scope.id}${path}` | For apps that nest tenants differently. |
| `appContext` | — | One sentence on what your app is, **added** to intentbar's own framing. Worth setting. |
| `onError` | — | Send failures to your monitoring; a silent abstain hides a broken key for weeks. |

## Guarantees

These are what the test suite is about, and they are the reason this is safe to
put in front of users:

- A destination id the sitemap does not contain is **rejected**, never turned
  into a path.
- A scope the server did not supply **falls back to the current one**.
- Low confidence, an explicit abstain, or a refused question all **leave the
  user where they are**.
- Control characters, backslashes and encoded traversal in the input are
  **rejected before any model call**.
- The typed text is JSON-quoted inside the shared input, so a phrase full of
  quotes or newlines **cannot pose as instructions**.

## Status

`0.1.0`. The Decisions API is in public beta and currently serves one model
(`gpt-6-luna`); if its shape changes, `src/core/providers/decisions.ts` is the
only file that follows.

MIT
