# intentbar

Natural-language navigation for your command palette. The user types where they
want to go — in any language, with typos — and lands on the right page.

```
⌘K  how do i add someone to the team
    ───────────────────────────────────────────
    Go to
    ✦ Settings › Members                     ↵
```

- **Zero dependencies.** One `fetch` call; the React hook is optional.
- **The model never writes a URL.** It picks an id from your own route list, and
  the path is assembled from that list. An answer that is not on it is an
  abstention, not a redirect.
- **Free and instant for known phrases.** An exact hit in your `intents` list
  skips the model entirely.

## How it works

Three pieces, and the skill below writes all three:

1. **A sitemap** — your read-only destinations. Each one carries an id, a path,
   a breadcrumb, a description of what people come there to do, and the
   phrasings they type for it.
2. **One endpoint** — a model API key cannot live in a browser bundle, so the
   typed text goes to your server. It asks [OpenAI's Decisions
   API](https://developers.openai.com/api/docs/guides/decisions) two bounded
   questions in a single request: *which of these pages is it?* (a `choice`) and
   *is this really a question for the assistant?* (a `predicate`).
3. **A palette row** — the hook hands your palette the match, and Enter
   navigates.

A malformed or invented answer is not a shape the model can return, and the
guarantees follow from that: an id the sitemap does not contain is rejected
rather than turned into a path, and anything under the confidence threshold
leaves the user where they are.

[docs/wiring.md](docs/wiring.md) is the same three pieces as code.

## Install

The whole repo is an agent skill — the instructions and the code ship together —
so there is one command, and nothing to run afterwards:

```bash
npx skills add enesozturk/intentbar
```

Then, in the agent:

```
/intentbar-setup
```

It reads your router, copies the code in from the skill directory (plain
TypeScript, no build step and no install script), writes the sitemap from your
own pages and vocabulary, mounts the handler, wires your existing palette — or
adds a ready shadcn one — and verifies the result against the live API.

The sitemap is the part that decides whether this works, which is why a copy
command alone is not the whole install: written from route paths it performs
badly, and written from the app it is the product.

Updating is `npx skills update intentbar-setup` plus a fresh copy; the diff
shows up in your own version control.

## What it does, measured

Eight destinations — Dashboard, Orders, Products, Assistant, and Settings ›
Billing / Members / API tokens / Profile — with an English-only sitemap:

| typed | row shown | |
| --- | --- | --- |
| `invoices` | Settings › Billing | exact hit, no request |
| `add someone to my workspace` | Settings › Members | 0.99 |
| `create an api key` | Settings › API tokens | 0.99 |
| `cómo agrego a alguien al equipo` | Settings › Members | 0.98 |
| `dashbard` | Dashboard | 0.92 |
| `why did my revenue drop last week` | Ask the assistant | 1.00 |
| `how did last week go` | Ask the assistant, Dashboard below it | 0.97 / 0.73 |
| `asdfgh qwerty` | nothing | abstains |

Three things in that table are the whole design. A typo resolves because the
model reads intent, not strings. A Spanish sentence resolves against English
descriptions, so a sitemap does not have to be translated to serve translated
users. And a question is answered with the assistant rather than with "no
matching page found" — the fallback row, which rides along in the same request.

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

## More

- [docs/wiring.md](docs/wiring.md) — the sitemap, the endpoint, the palette and
  the fallback row, as code.
- [docs/reference.md](docs/reference.md) — options, and the guarantees the test
  suite is about.
- [docs/multi-tenant.md](docs/multi-tenant.md) — resolving "acme billing" inside
  the workspace the session says the user belongs to.

## Status

Experimental, and deliberately not on npm — there is no release to depend on,
no semver promise and no update channel beyond `npx skills update` and a fresh
copy into your project. The Decisions API is itself in public beta and serves
one model today (`gpt-6-luna`); if its shape changes,
`src/core/providers/decisions.ts` is the only file that follows.

MIT
