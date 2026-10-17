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

- **Zero dependencies.** One `fetch` call; the React hook is optional.
- **Typed answers, not generated text.** Built on [OpenAI's Decisions
  API](https://developers.openai.com/api/docs/guides/decisions) (`choice` and
  `predicate` questions), so a malformed or invented answer is not a shape the
  model can return. Swap the provider if you want a different one.
- **Free and instant for known phrases.** An exact hit in your `intents` list
  skips the model entirely.

## Install

intentbar is **not an npm package**. It is ~1,100 lines of dependency-free
TypeScript and the palette is meant to be restyled, so it is distributed the way
shadcn distributes components: the code is copied into your project and is yours
from then on.

The whole repo is an agent skill — the instructions and the code ship together —
so there is one command, and nothing to run afterwards:

```bash
npx skills add enesozturk/intentbar
```

That lands intentbar in `.claude/skills/intentbar-setup/`, or the equivalent
directory for whichever of the [80-odd supported
agents](https://github.com/vercel-labs/skills) you use. The repo is private, and
`skills add` reuses the git credentials you already have (`gh`, a credential
helper, or SSH), so the same command works for anyone with access.

Then, in the agent:

```
/intentbar-setup
```

It reads your router, copies the code in from the skill directory — plain
TypeScript files, no build step and no install script — writes the sitemap with
real descriptions and phrasings, mounts the handler, wires your existing palette
(or adds a ready shadcn one) and verifies the result against the live API. The sitemap is the part that decides whether this works, and it
has to be written from your codebase rather than from a template, which is why a
copy command alone is not the whole install.

To take a newer version: `npx skills update intentbar-setup`, then ask the agent
to copy it in again. The diff shows up in your own version control.

The three pieces it wires up are below — you own them afterwards, so this is
what you are reading when you review the diff. The examples assume
`@/lib/intentbar`; substitute the alias it copied into.

## 1. The sitemap

**Let the skill write this one.** It is the whole product — `description` and
`intents` are what the model reasons over — and writing it well means reading
every page of the app, then mining the nav labels, page headings and
translation files for the words users actually type. `/intentbar-setup` does
exactly that, and finishes by measuring how many of your real phrases resolve
for free.

Hand-written from a list of route paths, it performs badly, and that is the
single most common reason this feature feels broken. The shape, for reading the
generated file:

```ts
// intentbar.sitemap.ts
import { defineSitemap } from "@/lib/intentbar";

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
import { createHandler } from "@/lib/intentbar/server";

import { sitemap } from "@/intentbar.sitemap";

export const POST = createHandler({
  sitemap,
  appContext: "An e-commerce admin panel for a store owner.",
  authorize: async (request) => Boolean(await getSession(request)),
});
```

Set `OPENAI_API_KEY` in the server environment. Not `NEXT_PUBLIC_*`, not
anything the client can read.

**`authorize` is not optional in practice.** Without it the endpoint is open to
anyone who can reach it, and every request spends your API budget.

## 3a. The palette, if you do not have one

`templates/command-palette.tsx` is a full ⌘K palette built on **shadcn/ui's
current `command` and `dialog`** components, copied in by `--palette` above. The
setup skill checks you have Tailwind and shadcn first, and adds
`command`/`dialog` if they are missing.

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
import { useIntentbar } from "@/lib/intentbar/react";

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

## The fallback row

Some text is not a destination. "Why did my revenue drop last week" is a
question, and answering it with "no matching page found" is a dead end.

```ts
export const POST = createHandler({
  sitemap,
  fallback: {
    path: (query) => `/chat?prompt=${encodeURIComponent(query)}`,
  },
});
```

A `predicate` question rides along in the same request — no extra round trip —
and `resolution.fallback` is set when the text reads as work for it. Measured
against a 8-destination sitemap, it separates sharply, and what hedging there is
stays well clear of a navigational phrase:

| prompt-like | | destination-like | |
| --- | --- | --- | --- |
| `why did my revenue drop last week` | 1.00 | `billing settings` | 0.00 |
| `how many orders came in yesterday` | 1.00 | `add someone to my workspace` | 0.00 |
| `which product sells best` | 0.72 | `create an api key` | 0.00 |

Give it its own row and let it take Enter: the user wrote a question, not a
destination. Override `fallback.instructions` to point it at a docs search, a
ticket form, or anything else.

### When both are present

A confident page match and a strong fallback are not exclusive. "How did last
week go" matches a Dashboard page at 0.73 — just over the threshold — *and*
scores 0.97 as a question, because both answers are right. intentbar returns both, with their numbers, and
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
| `appContext` | — | One sentence on what your app is, **added** to intentbar's own framing. Worth setting. |
| `onError` | — | Send failures to your monitoring; a silent abstain hides a broken key for weeks. |

### Multi-tenant apps

If your URLs carry a workspace, team or org, intentbar can resolve "acme
billing" to Billing inside Acme — and only when the session says that user
belongs to Acme. It is off until you pass scopes, so it adds nothing to a
single-tenant install: [docs/multi-tenant.md](docs/multi-tenant.md).

## Guarantees

These are what the test suite is about, and they are the reason this is safe to
put in front of users:

- A destination id the sitemap does not contain is **rejected**, never turned
  into a path.
- Low confidence, an explicit abstain, or a refused question all **leave the
  user where they are**.
- Control characters, backslashes and encoded traversal in the input are
  **rejected before any model call**.
- The typed text is JSON-quoted inside the shared input, so a phrase full of
  quotes or newlines **cannot pose as instructions**.

## Status

Experimental, and deliberately not on npm — there is no release to depend on,
no semver promise and no update channel beyond `npx skills update` and a fresh
copy into your project. The Decisions API is itself in public beta and currently serves one model
(`gpt-6-luna`); if its shape changes, `src/core/providers/decisions.ts` is the
only file that follows.

MIT
