# Multi-tenant apps

Skip this unless your URLs carry a workspace, team, org or project. intentbar
asks nothing about scopes until you pass them, so a single-tenant install is
unaffected by everything below.

With scopes on, "acme billing" opens Billing inside Acme — and only if the
session says that user belongs to Acme.

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

## Why the model is not asked which workspace

Naming a scope is handled in code, not by the model: it is more reliable, one
question cheaper, and it sharpens the destination answer. (Measured: the full
phrase "acme dashbard" scored 0.70 for the dashboard page, while "dashbard"
alone scored 0.97 — "acme" leaks probability onto workspace-ish pages.)

## Guarantees this adds

- The scope list comes from the server, never from the request body. It is the
  complete set of places a user can be sent, whatever they type.
- A scope the server did not supply **falls back to the current one**.
- `scopedPath` (default `/${scope.id}${path}`) is the one place a tenant path is
  assembled, for apps that nest tenants differently.
