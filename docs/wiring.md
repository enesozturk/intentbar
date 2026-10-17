# Wiring intentbar in

The `/intentbar-setup` skill does all of this for you, from your own codebase.
This page is what it writes, so you can read the diff — or do it by hand.

The examples assume the code was copied to `@/lib/intentbar`; substitute your
own alias.

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
current `command` and `dialog`** components, copied in alongside the resolver. The
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

