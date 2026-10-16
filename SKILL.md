---
name: intentbar-setup
description: Installs and wires up intentbar in this codebase — there is no npm package, so it copies the resolver in from the intentbar repo, adds a ready shadcn/ui command palette when the app has none, reads the app's routes, writes a deliberately small sitemap with real descriptions, fills each page's intents from the app's own navigation labels and translation files so common phrases resolve instantly and free, mounts the server handler, and connects the hook to the existing command palette. Use when the user asks to set up, install, configure or fix intentbar, or wants natural-language / AI navigation in their command palette.
---

# Installing intentbar

Your job is to leave the user with a working palette row, not with a config file
they still have to fill in. The package ships a resolver; **the sitemap is the
product**, and writing it is the part only someone who can read this codebase
can do.

Work in this order. Do not skip step 1 — a sitemap written from route paths
alone performs badly, and that is the single most common reason this feature
feels broken.

Two things in step 2 are **defaults, not options**: keeping the sitemap small
(2a) and filling the intents list from the app's own vocabulary (2b). They are
the only two levers on what this costs and how fast it feels, so do both without
being asked, and report the measured result in step 7.

## 0. Copy the code in

intentbar is not published to npm. The code travels with this skill: the
directory holding this `SKILL.md` also holds `src/`, `templates/`,
`docs/` and `scripts/vendor.mjs`. Nothing needs to be cloned or downloaded —
resolve that directory from this file's own path and run the copy script that
is already sitting next to it:

```bash
node <skill-dir>/scripts/vendor.mjs <project>/src/lib/intentbar --alias @/lib/intentbar
```

It copies the resolver, the server handler and the React hook, rewriting the
ESM `.js` import specifiers into the extensionless form bundlers expect.

Pick the target from the project's own layout and alias — `src/lib/`, `lib/`,
`app/lib/`, a `packages/*` workspace — and pass the alias that resolves there
(`tsconfig.json` `paths`, or `components.json` `aliases`). Everything after this
imports from `<alias>`, `<alias>/server` and `<alias>/react`; the examples below
write `@/lib/intentbar`, so substitute yours.

Add `--palette <file>` to that command in step 5a, not here: whether the palette
is copied at all depends on what you find in step 5.

To take a newer version later, the user updates the skill
(`npx skills update intentbar-setup`) and you re-run the script; the diff shows
up in their own version control.

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

### Collect the app's own vocabulary while you are in there

You need the words users type, and this codebase already contains most of them.
Gather, as you go:

- **Translation files** — `locales/`, `messages/`, `*.json` under an `i18n`
  directory, `next-intl` / `react-i18next` resources. This is the single richest
  source: a localized app already states every nav label, page title and menu
  item **in every language it ships**. Mine the keys that correspond to the
  pages you are listing.
- **The navigation itself** — sidebar, menu, tab and breadcrumb labels. These
  are what the user has been reading, so they are what they type.
- **Page headings, empty states and primary buttons** — "You have no invoices
  yet", "Invite teammate" give you the nouns and verbs of the page.
- **Help, FAQ or docs content** in the repo, if any. Those headings are written
  in user language by definition.

Note which languages the product ships in. You will write intents in all of
them, not only English.

## 2. Write the sitemap

Create `intentbar.sitemap.ts` (or wherever the project keeps constants):

```ts
import { defineSitemap } from "@/lib/intentbar";

export const sitemap = defineSitemap([
  {
    id: "settings-billing",
    path: "/settings/billing",
    breadcrumb: ["Settings", "Billing"],
    description: "Invoices, the current plan, and the payment method on file.",
    intents: ["billing", "invoices", "change my plan", "payment method"],
  },
]);
```

Rules that decide whether this works:

- `description` says what the user DOES there, in their words, not the
  component's name. "Invite teammates and change their roles" beats "Members
  table".
- `breadcrumb` is what the palette row shows. Match the app's own navigation
  labels, so the row looks like somewhere the user has been.
- Give adjacent pages *distinct* descriptions. "Google Ads" and "Google Ads
  report" that read alike will split probability and abstain — the most
  confusing failure mode, because both answers were nearly right.

The two rules below are not polish. They are the only two levers on what this
feature costs and how fast it feels, so do both by default — do not ask whether
to, and do not leave them for later.

### 2a. Keep the sitemap small — a budget, not a preference

Every destination — id, breadcrumb, description and all its intents — is sent on
every lookup, so **the sitemap IS the request**. Measured against the live API:

| sitemap | input tokens | per 1,000 lookups |
| --- | --- | --- |
| 7 lean destinations | 388 | $0.04 |
| 15 lean | 682 | $0.07 |
| 25 lean | 1,048 | $0.11 |
| 25 real ones, intents in two languages, both optional questions | 1,793 | $0.18 |
| 50 lean | 1,957 | $0.20 |

About 130 tokens of framing plus 37–51 per destination — the spread is how long
your descriptions and intents are. And there is **no caching discount**:
identical repeated requests still bill full input, so this is a per-lookup cost
forever, not a warm-up.

**Target 15–30 destinations. Treat 40 as the ceiling** and say so to the user if
you are pushing against it. Size is not only money: a long list makes every
answer less confident, because near-duplicates split probability and the
resolver abstains.

To choose, rank candidate pages by *how often someone would ask for them* and
cut from the bottom:

- Keep: the pages in the nav, the ones support links to, the ones with their own
  menu entry.
- Cut: anything reachable in one click from a page you kept and rarely asked for
  by name — sub-tabs, per-item detail views, admin-only internals, duplicate
  report variants of a page already listed.
- Cut: pages whose description you cannot write without repeating another
  entry's. Two pages that need the same sentence should be one entry pointing at
  the better landing place.

Report the final count and the resulting per-1,000-lookup cost when you hand
over.

### 2b. Enrich `intents` — this is the free path

An exact match against `intents` **skips the model entirely**: 0 ms, $0, no
network. So the intents list is a cache you write by hand, and filling it is
what makes the common phrases instant.

**It is not free, though, and do not tell the user it is.** Those phrases ride
in every request that *does* reach the model, at roughly 4 tokens each. On a
25-destination sitemap, adding 6 intents per page costs ~600 tokens per lookup
(+34%), which pays for itself only once it converts enough traffic to the free
path:

| intents added per destination | lookup grows by | breaks even at an exact-hit rate of |
| --- | --- | --- |
| 2 | +200 tokens | 10% |
| 4 | +400 | 18% |
| 6 | +600 | 25% |
| 10 | +1,000 | 36% |

Nav labels and page titles alone usually clear that bar, which is why they go in
first. But the real argument is latency, and it holds either way: an exact hit
is **0 ms with no network**, against 200–1000 ms for a model call. Enrich for
the speed; expect the money to be roughly a wash.

So: aim for **6–12 intents per destination**, ordered by how likely they are to
be typed, built from the vocabulary you collected in step 1 rather than
invented. Padding the list past that spends tokens on phrasings nobody types.

1. **The nav label and page title**, exactly as the app shows them, in every
   shipped language. From the translation files — these are free wins, because
   the user is typing what they just read in the sidebar.
2. **The thing itself, as a bare noun**: "invoices", "orders", "members".
3. **The task, as the user would say it**: "change my plan", "invite someone",
   "refund an order", "reset a password".
4. **The obvious synonym** your UI does *not* use: if the page is "Members",
   users type "team", "colleagues", "users".
5. **Abbreviations and the words support uses** on the phone: "2FA", "MFA",
   "SSO", "shipping".

Two things that decide whether these actually hit:

- **Matching is whole-phrase and case-insensitive, not stemmed.** "invoice"
  does not match "invoices", so write both: `["invoice", "invoices"]`. In a
  heavily inflected language (Turkish, Finnish, Hungarian) one noun can take a
  dozen forms — write the two or three users actually type, in every language
  the app ships.
- **Do not add misspellings.** The model handles typos — measured, "dashbard"
  resolves at 1.00 — so a list of typos is noise that costs tokens on every
  lookup.

Keep each intent a short phrase. A whole sentence will never be typed verbatim,
so it buys nothing in the exact path and only enlarges the request.

If the project has search or analytics logs for its own palette or help centre
(a `search_queries` table, a PostHog/Amplitude event, support macros), read the
top queries and put the real ones in. Ask the user whether such a source exists
rather than assuming it does not — it is the difference between guessed
vocabulary and theirs.

## 3. Mount the handler

The API key must stay on the server, so there is exactly one endpoint to add.
Match the project's framework:

```ts
// Next.js App Router — app/api/intentbar/route.ts
import { createHandler } from "@/lib/intentbar/server";

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

That is the whole endpoint for most apps. **If, and only if, the URLs carry a
workspace, team, org or project**, intentbar can also resolve "acme billing" to
Billing inside Acme; that is one extra option on this same handler, documented
in `docs/multi-tenant.md` next to this file. Nothing else in this skill
changes, so leave it out unless the app actually has tenants in the URL.

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

## 5. The palette

There are two routes here and they are not interchangeable. **Look first:**
search for `cmdk`, `CommandDialog`, "command palette", a ⌘K key handler.

- **The app already has a palette** → 5b. Add rows to theirs. Never replace a
  palette someone already built and styled.
- **It has none** → 5a. Copy in the ready one.

### 5a. Copy in the palette (no palette exists yet)

This skill ships `templates/command-palette.tsx`, written against shadcn/ui's
current `command` and `dialog` components. It is copied into the project, the
way shadcn distributes components, so the team owns and can restyle it.

**Check the prerequisites before copying anything.** This template is Tailwind +
shadcn/ui. Dropping it into a project without them produces an unstyled,
broken-looking bar, which is worse than no feature:

1. **Tailwind** — a `tailwind.config.*`, or a `@import "tailwindcss"` in the
   global stylesheet for v4. **If there is no Tailwind, stop and say so.** Offer
   the alternatives: wire intentbar into whatever UI they do have with the
   headless hook (5b), or let them add Tailwind first. Do not copy the file and
   hope.
2. **shadcn/ui** — a `components.json`, and `cn` in `@/lib/utils`. If shadcn is
   set up but `command` or `dialog` is missing, add them with the project's own
   CLI: `npx shadcn@latest add command dialog`.
3. The alias the project actually uses. `components.json` has `aliases.ui` —
   it is often `@/components/ui`, but not always, and the template's imports
   must match. Fix them while copying, not after.

Then copy it with the same script as step 0, which rewrites its import of the
hook to the alias you vendored into:

```bash
node <skill-dir>/scripts/vendor.mjs <project>/src/lib/intentbar \
  --palette <project>/src/components/intentbar/command-palette.tsx \
  --alias @/lib/intentbar
```

Fix the `@/components/ui/*` imports if this project's `aliases.ui` differs,
install `cmdk` and `lucide-react` if `shadcn add` did not, and mount it where
the app's layout lives:

```tsx
const [open, setOpen] = React.useState(false);
const router = useRouter();

<CommandPalette
  open={open}
  onOpenChange={setOpen}
  onNavigate={(path) => router.push(path)}
  scopeId={currentWorkspaceSlug} // multi-tenant apps only; omit otherwise
  commands={[
    { id: "settings", label: "Settings", perform: () => router.push("/settings") },
  ]}
/>;
```

It binds ⌘K/Ctrl+K itself. Pass the app's existing palette entries (or its main
nav items) as `commands` so it is a real palette rather than only an AI row —
typing one of those labels exactly is also what stops a known command from
costing a model call.

Two things in that file worth knowing before you edit it:

- It composes `Dialog` + `Command` **instead of** shadcn's `CommandDialog`,
  deliberately. `CommandDialog` spreads its props onto `Dialog` and hands the
  cmdk root a fixed `className`, so there is no way through it to pass the
  controlled `value` and the custom `filter`. Both are required: the resolved
  rows do not contain the typed text, so cmdk's default scorer hides them.
- The resolved rows' values are prefixed `intentbar-`, and `paletteFilter`
  returns 1 for that prefix. Keep the prefix if you rename things.

### 5b. Wire the existing palette

Find the palette — `cmdk`, a Radix dialog, a custom one — and add rows to it.
Match what is there, including its row markup, icon sizing and selected-row
styling. The `templates/command-palette.tsx` beside this file is a working reference
for the behaviour even when you are not copying it.

```tsx
const { resolution, isResolving, error } = useIntentbar(search, {
  scopeId: currentWorkspaceSlug, // multi-tenant apps only; omit otherwise
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
- Multi-tenant apps only: if `resolution.scope` came back with
  `isCurrent: false`, say so in the row ("Switch to Acme"). Moving someone
  between tenants without telling them is disorienting.

## 6. The fallback row (optional, but this is the good part)

If the app has an assistant, a chat, or a search page that accepts a query,
configure `fallback`. Text like "how are my ads performing" is not a
destination, and without this the palette answers it with "no matching page".

```ts
fallback: {
  path: (query) => `/chat?prompt=${encodeURIComponent(query)}`, // add the tenant here if the app has one
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

Include cases that *should* abstain (off-topic text, gibberish). Print
`result.method` alongside the id — `"exact"` means the intents list answered and
no request was made.

Then measure the two levers from step 2, because "I enriched the intents" is not
a result:

1. **Exact-hit rate.** Take the nav label and page title of every destination,
   plus the phrasings you expect to be most common, and run them. Every one of
   those *should* come back `method: "exact"`. Any that calls the model is a
   phrasing missing from that page's `intents` — add it and re-run. This is the
   cheap loop: each one you fix is a lookup that is free and instant forever.
2. **Cost per 1,000 lookups.** Count the destinations and read it off the table
   in step 2a (~130 tokens + ~37 each, at $0.10/1M input). Report the number.

Two failures worth knowing how to read:

- **A phrase lands just under the threshold** — usually a description that does
  not contain the words users type. Fix the sitemap entry, not the threshold.
- **Two sibling pages split the probability** (0.47/0.46) and it abstains. Their
  descriptions overlap. Make them distinct, merge them, or accept the abstain:
  on a genuine coin flip, abstaining beats guessing.

Hand over with the measured numbers, not a claim that it works:

> 24 destinations, $0.10 per 1,000 lookups. 19 of 24 nav labels resolve
> exact (free, 0 ms); the 5 that call the model do so at 0.95+. 14 test
> phrases across both shipped languages: 13 as expected, 1 abstains (`X` splits between
> A and B — their descriptions overlap, worth a look).
