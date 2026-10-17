# Reference

Options, and the guarantees the test suite is about. See
[wiring.md](wiring.md) for where each of these is passed.

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
single-tenant install: [multi-tenant.md](multi-tenant.md).

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

