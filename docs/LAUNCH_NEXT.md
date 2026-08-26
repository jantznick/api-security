# Launch next steps (outside Render)

Render env rebuilds are done. Custom hosts were healthy as of 2026-08-26:

- `https://api.apiglimpse.com/api/health` → ok  
- `https://collect.apiglimpse.com/health` → ok  
- `https://apiglimpse.com` / `app.` / `docs.` → ok  

No password-reset work planned (auth is magic-link oriented for now). **No further code changes required** for the soft-launch loop below.

---

## 1. Resend (magic-link email in production)

Without this, “email me a magic link” succeeds in the API but **no email is sent** (core only logs a warning).

1. Create/sign in at [resend.com](https://resend.com).
2. Add and verify domain **`apiglimpse.com`** (Resend will show DNS: SPF / DKIM / etc.).
3. Create an API key.
4. On Railway → project **api-glimpse** → service **core** → Variables, add:
   - `RESEND_API_KEY` = (the key)
   - `RESEND_FROM_EMAIL` = `API Glimpse <noreply@apiglimpse.com>`  
     (or whatever verified sender Resend allows)
5. Redeploy **core** if Railway doesn’t auto-restart on variable change.
6. Test: open `https://apiglimpse.com/?auth=login` → request magic link → inbox (and spam).

Quick test sender before domain verify: Resend’s `onboarding@resend.dev` only delivers to **your** Resend account email — fine for a smoke test, not for real users.

---

## 2. Publish connectors (npm / PyPI / Go)

Customers need public packages — same role as `npm install` for Express, but also Fastify, FastAPI (`pip`), and Go (`go get`).

- **All languages:** **[CONNECTOR_PUBLISH.md](./CONNECTOR_PUBLISH.md)**
- **npm deep dive (account / org / 2FA):** **[NPM_PUBLISH.md](./NPM_PUBLISH.md)**

Short npm version:

1. npm account + **2FA**
2. Create org **`apiglimpse`** (free/public packages plan)
3. `npm login` && `npm whoami`
4. Publish **shared**, then **middleware**, then **fastify**:

```bash
cd packages/shared
npm publish --access public

cd ../middleware
npm run publish:npm

cd ../fastify
npm run publish:npm
```

5. Confirm:

```bash
npm view @apiglimpse/shared version
npm view @apiglimpse/middleware version
npm view @apiglimpse/fastify version
```

6. PyPI + Go (see CONNECTOR_PUBLISH): `twine upload` for `apiglimpse`, tag `connectors/go/v0.1.0` for the Go module.

Docs / marketing install snippets should use registry installs from [INTEGRATING.md](./INTEGRATING.md), with:

```bash
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com
API_SENSOR_KEY=ask_...
```

---

## 3. End-to-end smoke (after Resend + npm, or npm-only with local package)

1. Register or magic-link login on marketing → land on `app.apiglimpse.com/projects`
2. Create a project → copy `ask_…` key from project settings
3. Run a small Express app with `@apiglimpse/middleware` + collect URL + key
4. Hit a few routes → inventory appears on the dashboard
5. `POST https://collect.apiglimpse.com/v1/samples` with no key → rejected (not 2xx)

Local checklist details: [TESTING.md](./TESTING.md).

---

## 4. Optional checks (no code)

| Check | If wrong |
| --- | --- |
| Marketing deep link (e.g. `/how-it-works` refresh) 404s | Render → Marketing → **Redirects/Rewrites** → `/*` → `/index.html` (Rewrite) |
| Dashboard `/projects` 404s / downloads a text file | Same rewrite on the **Dashboard** static site (or merge `frontend/public/_redirects`) |
| Login works on marketing but cookie missing on app | Confirm both built with `VITE_API_URL=https://api.apiglimpse.com` and core has `COOKIE_DOMAIN=.apiglimpse.com` |
| Magic link URL points at wrong host | Core `MARKETING_URL=https://apiglimpse.com` |

---

## Explicitly deferred

- Password reset / change-password flows  
- Stripe live keys / soft-launch Checkout (scaffold + Admin plans are in-repo — see [STRIPE.md](./STRIPE.md))  
- Extra connectors beyond Express / Fastify / FastAPI / Go (Nest, Next, Hono, proxy)  

